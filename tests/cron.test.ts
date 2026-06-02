import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../src/config/db';
import cronService from '../src/services/cron.service';
import { createTestProductCatalog, createTestUser, setInventoryQuantity } from './helpers/fixtures';

interface OrderStatusRow extends RowDataPacket {
  status: string;
  payment_status: string;
}

interface InventoryRow extends RowDataPacket {
  quantity: number;
}

describe('Automated Order Expiration & Restocking Integration Engine', () => {
  let user: { id: number; token: string };
  let catalog: { productId: number; variantId: number; sku: string };

  beforeAll(async () => {
    user = await createTestUser();
    catalog = await createTestProductCatalog();
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [
      user.id,
    ]);
    await pool.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [
      user.id,
    ]);
    await pool.execute('DELETE FROM orders WHERE user_id = ?', [user.id]);
    await pool.execute('DELETE FROM addresses WHERE user_id = ?', [user.id]);
    await pool.execute(
      `DELETE ci FROM cart_items ci
       INNER JOIN carts c ON c.id = ci.cart_id
       WHERE c.user_id = ?`,
      [user.id],
    );
    await pool.execute('DELETE FROM carts WHERE user_id = ?', [user.id]);
    await pool.execute(
      `DELETE wi FROM wishlist_items wi
       INNER JOIN wishlists w ON w.id = wi.wishlist_id
       WHERE w.user_id = ?`,
      [user.id],
    );
    await pool.execute('DELETE FROM wishlists WHERE user_id = ?', [user.id]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [user.id]);
    await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    await pool.execute('DELETE FROM inventory WHERE variant_id = ?', [catalog.variantId]);
    await pool.execute('DELETE FROM product_variants WHERE id = ?', [catalog.variantId]);
    await pool.execute('DELETE FROM products WHERE id = ?', [catalog.productId]);
  });

  it('identifies stale PENDING_PAYMENT orders, cancels them, and restores inventory', async () => {
    const pool = getPool();

    await setInventoryQuantity(catalog.variantId, 10);

    const staleOrderNumber = `NB-STALE-${Date.now()}`;
    const [orderResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO orders
         (user_id, order_number, currency, status, payment_status, fulfillment_status,
          subtotal_lkr, discount_lkr, shipping_lkr, total_lkr, created_at)
       VALUES
         (?, ?, 'LKR', 'PENDING_PAYMENT', 'UNPAID', 'UNFULFILLED', 2000, 0, 0, 2000, NOW() - INTERVAL 45 MINUTE)`,
      [user.id, staleOrderNumber],
    );
    const orderId = orderResult.insertId;

    await pool.execute(
      `INSERT INTO order_items
         (order_id, variant_id, product_title, variant_title, sku, quantity, unit_price_lkr, line_total_lkr)
       VALUES
         (?, ?, 'Cron Test Product', 'Cron Variant', ?, 3, 1000, 3000)`,
      [orderId, catalog.variantId, catalog.sku],
    );

    await pool.execute('UPDATE inventory SET quantity = 7 WHERE variant_id = ?', [catalog.variantId]);

    const report = await cronService.expireAbandonedOrders(30);
    expect(report.expiredCount).toBe(1);

    const [orderRows] = await pool.execute<OrderStatusRow[]>(
      'SELECT status, payment_status FROM orders WHERE id = ?',
      [orderId],
    );
    expect(orderRows[0].status).toBe('CANCELLED');
    expect(orderRows[0].payment_status).toBe('UNPAID');

    const [inventoryRows] = await pool.execute<InventoryRow[]>(
      'SELECT quantity FROM inventory WHERE variant_id = ?',
      [catalog.variantId],
    );
    expect(Number(inventoryRows[0].quantity)).toBe(10);

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });
});
