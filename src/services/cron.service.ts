import { getPool } from '../config/db';
import type { RowDataPacket } from 'mysql2';

interface ExpireReport {
  expiredCount: number;
}

interface StaleOrderRow extends RowDataPacket {
  id: number;
}

interface OrderLineRow extends RowDataPacket {
  variant_id: number;
  quantity: number;
}

async function expireAbandonedOrders(expirationMinutes = 30): Promise<ExpireReport> {
  const pool = getPool();
  const connection = await pool.getConnection();
  let expiredCount = 0;

  try {
    await connection.beginTransaction();

    const [staleOrders] = await connection.query<StaleOrderRow[]>(
      `SELECT id
       FROM orders
       WHERE status = 'PENDING_PAYMENT'
         AND created_at < NOW() - INTERVAL ? MINUTE
       FOR UPDATE`,
      [expirationMinutes],
    );

    if (staleOrders.length === 0) {
      await connection.commit();
      return { expiredCount: 0 };
    }

    expiredCount = staleOrders.length;
    const staleOrderIds = staleOrders.map((o) => o.id);

    const [orderLines] = await connection.query<OrderLineRow[]>(
      'SELECT variant_id, quantity FROM order_items WHERE order_id IN (?)',
      [staleOrderIds],
    );

    for (const line of orderLines) {
      await connection.execute(
        'UPDATE inventory SET quantity = quantity + ? WHERE variant_id = ?',
        [line.quantity, line.variant_id],
      );
    }

    await connection.query(
      `UPDATE orders
       SET status = 'CANCELLED',
           payment_status = 'UNPAID'
       WHERE id IN (?)`,
      [staleOrderIds],
    );

    await connection.commit();
    return { expiredCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  expireAbandonedOrders,
};
