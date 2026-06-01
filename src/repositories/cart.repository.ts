import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../config/db';
import type { CartItemResponse, CartResponse, CartStatus } from '../types/cart';

interface CartIdRow extends RowDataPacket {
  id: number;
}

interface CartHeaderRow extends RowDataPacket {
  id: number;
  status: CartStatus;
}

interface CartItemRow extends RowDataPacket {
  id: number;
  variant_id: number;
  sku: string;
  product_title: string;
  variant_title: string | null;
  price_lkr: number;
  quantity: number;
  line_total_lkr: number;
  available_stock: number;
}

interface LineQuantityRow extends RowDataPacket {
  quantity: number;
}

async function getOrCreateActiveCart(userId: number): Promise<number> {
  const connection = await getPool().getConnection();
  try {
    const [rows] = await connection.execute<CartIdRow[]>(
      "SELECT id FROM carts WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
      [userId],
    );

    if (rows.length > 0) {
      return rows[0].id;
    }

    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO carts (user_id, status) VALUES (?, 'ACTIVE')",
      [userId],
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function getLineQuantity(cartId: number, variantId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<LineQuantityRow[]>(
    'SELECT quantity FROM cart_items WHERE cart_id = ? AND variant_id = ? LIMIT 1',
    [cartId, variantId],
  );
  return rows[0]?.quantity ?? 0;
}

async function addItemToCart(cartId: number, variantId: number, quantity: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO cart_items (cart_id, variant_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [cartId, variantId, quantity],
  );
}

async function updateItemQuantity(cartId: number, variantId: number, quantity: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND variant_id = ?`,
    [quantity, cartId, variantId],
  );
}

async function removeItemFromCart(cartId: number, variantId: number): Promise<void> {
  const pool = getPool();
  await pool.execute('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?', [cartId, variantId]);
}

async function getDetailedCart(userId: number): Promise<CartResponse | null> {
  const pool = getPool();

  const [cartRows] = await pool.execute<CartHeaderRow[]>(
    "SELECT id, status FROM carts WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
    [userId],
  );

  if (cartRows.length === 0) {
    return null;
  }

  const cart = cartRows[0];

  const [itemRows] = await pool.execute<CartItemRow[]>(
    `SELECT
       ci.id,
       ci.variant_id,
       pv.sku,
       p.title AS product_title,
       pv.title AS variant_title,
       pv.price_lkr,
       ci.quantity,
       (pv.price_lkr * ci.quantity) AS line_total_lkr,
       COALESCE(i.quantity, 0) AS available_stock
     FROM cart_items ci
     INNER JOIN product_variants pv ON ci.variant_id = pv.id
     INNER JOIN products p ON pv.product_id = p.id
     LEFT JOIN inventory i ON pv.id = i.variant_id
     WHERE ci.cart_id = ?`,
    [cart.id],
  );

  const items: CartItemResponse[] = itemRows.map((row) => ({
    id: row.id,
    variant_id: row.variant_id,
    sku: row.sku,
    product_title: row.product_title,
    variant_title: row.variant_title,
    price_lkr: Number(row.price_lkr),
    quantity: Number(row.quantity),
    line_total_lkr: Number(row.line_total_lkr),
    available_stock: Number(row.available_stock),
  }));

  const subtotal_lkr = items.reduce((acc, item) => acc + item.line_total_lkr, 0);

  return {
    id: cart.id,
    status: cart.status,
    items,
    subtotal_lkr,
  };
}

export default {
  getOrCreateActiveCart,
  getLineQuantity,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  getDetailedCart,
};
