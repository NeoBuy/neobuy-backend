import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import {
  acquireConnection,
  execute,
  isTestTransactionActive,
  releaseConnection,
} from '../config/db';
import type { CartItemResponse } from '../types/cart';
import type { OrderItemResponse, OrderResponse } from '../types/order';
import { createHttpError } from '../utils/http-error';

interface InventoryLockRow extends RowDataPacket {
  variant_id: number;
  price_lkr: number;
  sku: string;
  quantity: number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  order_number: string;
  status: OrderResponse['status'];
  total_lkr: number;
  created_at: Date;
  line1: string;
  phone: string;
}

interface OrderItemRow extends RowDataPacket {
  variant_id: number;
  sku: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  unit_price_lkr: number;
  line_total_lkr: number;
}

function buildOrderNumber(): string {
  return `NB-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function createShippingAddress(
  connection: PoolConnection,
  userId: number,
  shippingAddress: string,
  contactPhone: string,
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO addresses
       (user_id, label, recipient_name, phone, line1, city, province, district, country_code)
     VALUES
       (?, 'Checkout', 'Checkout Recipient', ?, ?, 'N/A', 'N/A', 'N/A', 'LK')`,
    [userId, contactPhone, shippingAddress],
  );
  return result.insertId;
}

async function createOrderWithLocking(
  userId: number,
  cartId: number,
  cartItems: CartItemResponse[],
  shippingAddress: string,
  contactPhone: string,
): Promise<number> {
  const variantIds = cartItems.map((item) => item.variant_id).sort((a, b) => a - b);
  if (variantIds.length === 0) {
    throw createHttpError(400, 'Cannot create order with empty cart items.');
  }

  const { connection, owned } = await acquireConnection();
  const shouldManageTransaction = owned && !isTestTransactionActive();

  try {
    if (shouldManageTransaction) {
      await connection.beginTransaction();
    }

    const [liveCatalogRowsRaw] = await connection.query(
      `SELECT pv.id AS variant_id, pv.price_lkr, pv.sku, i.quantity
       FROM product_variants pv
       INNER JOIN inventory i ON i.variant_id = pv.id
       INNER JOIN products p ON p.id = pv.product_id
       WHERE pv.id IN (?) AND pv.status = 'ACTIVE' AND p.status = 'ACTIVE'
       FOR UPDATE`,
      [variantIds],
    );
    const liveCatalogRows = liveCatalogRowsRaw as InventoryLockRow[];

    const catalogMap = new Map<number, { stock: number; price: number; sku: string }>();
    for (const row of liveCatalogRows) {
      catalogMap.set(row.variant_id, {
        stock: Number(row.quantity),
        price: Number(row.price_lkr),
        sku: row.sku,
      });
    }

    const resolvedByVariant = new Map<number, { price: number; lineTotal: number }>();
    let computedSubtotalLkr = 0;

    for (const item of cartItems) {
      const liveMetrics = catalogMap.get(item.variant_id);
      if (!liveMetrics) {
        throw createHttpError(404, 'Product SKU reference no longer exists in our master catalog.');
      }

      if (liveMetrics.stock < item.quantity) {
        const stockError = new Error(
          `Stock deficit for SKU: ${liveMetrics.sku}. Requested: ${item.quantity}, Available: ${liveMetrics.stock}`,
        ) as Error & {
          code?: string;
          status?: number;
          variantId?: number;
          sku?: string;
          productTitle?: string;
          variantTitle?: string | null;
          availableStock?: number;
          requestedQuantity?: number;
        };
        stockError.code = 'INSUFFICIENT_STOCK';
        stockError.status = 400;
        stockError.variantId = item.variant_id;
        stockError.sku = liveMetrics.sku;
        stockError.productTitle = item.product_title || 'Unknown Product';
        stockError.variantTitle = item.variant_title || null;
        stockError.availableStock = liveMetrics.stock;
        stockError.requestedQuantity = item.quantity;
        throw stockError;
      }

      const resolvedLineTotal = liveMetrics.price * Number(item.quantity);
      resolvedByVariant.set(item.variant_id, {
        price: liveMetrics.price,
        lineTotal: resolvedLineTotal,
      });
      computedSubtotalLkr += resolvedLineTotal;
    }

    const orderNumber = buildOrderNumber();
    const shippingAddressId = await createShippingAddress(
      connection,
      userId,
      shippingAddress,
      contactPhone,
    );

    const [orderInsert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO orders
         (order_number, user_id, currency, status, payment_status, fulfillment_status,
          subtotal_lkr, discount_lkr, shipping_lkr, total_lkr, shipping_address_id)
       VALUES
         (?, ?, 'LKR', 'PENDING_PAYMENT', 'UNPAID', 'UNFULFILLED', ?, 0, 0, ?, ?)`,
      [orderNumber, userId, computedSubtotalLkr, computedSubtotalLkr, shippingAddressId],
    );
    const orderId = orderInsert.insertId;

    for (const item of cartItems) {
      const qty = Number(item.quantity);
      const resolved = resolvedByVariant.get(item.variant_id);
      if (!resolved) {
        throw createHttpError(500, 'Failed to resolve locked live pricing for checkout item.');
      }

      await connection.execute(
        'UPDATE inventory SET quantity = quantity - ? WHERE variant_id = ?',
        [qty, item.variant_id],
      );

      await connection.execute(
        `INSERT INTO order_items
           (order_id, variant_id, product_title, variant_title, sku, unit_price_lkr, quantity, line_total_lkr)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.variant_id,
          item.product_title,
          item.variant_title,
          item.sku,
          resolved.price,
          qty,
          resolved.lineTotal,
        ],
      );
    }

    await connection.execute("UPDATE carts SET status = 'ORDERED' WHERE id = ?", [cartId]);

    if (shouldManageTransaction) {
      await connection.commit();
    }

    return orderId;
  } catch (error) {
    if (shouldManageTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    await releaseConnection(connection, owned);
  }
}

async function getOrderDetails(orderId: number, userId: number): Promise<OrderResponse | null> {
  const [orderRowsRaw] = await execute(
    `SELECT o.id, o.order_number, o.status, o.total_lkr, o.created_at, a.line1, a.phone
     FROM orders o
     INNER JOIN addresses a ON a.id = o.shipping_address_id
     WHERE o.id = ? AND o.user_id = ?
     LIMIT 1`,
    [orderId, userId],
  );
  const orderRows = orderRowsRaw as OrderRow[];

  if (orderRows.length === 0) {
    return null;
  }

  const [itemRowsRaw] = await execute(
    `SELECT oi.variant_id, pv.sku, p.title AS product_title, pv.title AS variant_title,
            oi.quantity, oi.unit_price_lkr, oi.line_total_lkr
     FROM order_items oi
     INNER JOIN product_variants pv ON oi.variant_id = pv.id
     INNER JOIN products p ON pv.product_id = p.id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [orderId],
  );
  const itemRows = itemRowsRaw as OrderItemRow[];

  const items: OrderItemResponse[] = itemRows.map((row) => ({
    variantId: row.variant_id,
    sku: row.sku,
    productTitle: row.product_title,
    variantTitle: row.variant_title,
    quantity: Number(row.quantity),
    priceLkr: Number(row.unit_price_lkr),
    lineTotalLkr: Number(row.line_total_lkr),
  }));

  const order = orderRows[0];

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmountLkr: Number(order.total_lkr),
    shippingAddress: order.line1,
    contactPhone: order.phone,
    items,
    createdAt: order.created_at,
  };
}

export default {
  createOrderWithLocking,
  getOrderDetails,
};
