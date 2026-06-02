import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import StripeClient from 'stripe';
import { getPool } from '../config/db';
import { createHttpError } from '../utils/http-error';

interface PendingOrderRow extends RowDataPacket {
  total_lkr: number;
  order_number: string;
}

interface OrderLockRow extends RowDataPacket {
  status:
    | 'PENDING_PAYMENT'
    | 'PLACED'
    | 'CONFIRMED'
    | 'PACKED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REFUNDED';
}

interface OrderItemForRestockRow extends RowDataPacket {
  variant_id: number;
  quantity: number;
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw createHttpError(503, 'Stripe is not configured on this environment.');
  }
  return key;
}

function getFrontendUrl(): string {
  return process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
}

function getStripeClient() {
  return new StripeClient(getStripeSecretKey(), {
    apiVersion: '2026-05-27.dahlia',
  });
}

async function createCheckoutSession(orderId: number, userId: number): Promise<string> {
  const pool = getPool();

  const [orderRows] = await pool.execute<PendingOrderRow[]>(
    "SELECT total_lkr, order_number FROM orders WHERE id = ? AND user_id = ? AND status = 'PENDING_PAYMENT' LIMIT 1",
    [orderId, userId],
  );

  if (orderRows.length === 0) {
    throw createHttpError(404, 'No eligible pending checkout container found for this ID.');
  }

  const order = orderRows[0];
  const stripe = getStripeClient();
  const frontendUrl = getFrontendUrl();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'lkr',
          product_data: {
            name: `Order Reference: ${order.order_number}`,
          },
          unit_amount: Math.round(Number(order.total_lkr) * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId: orderId.toString(),
      userId: userId.toString(),
    },
    success_url: `${frontendUrl}/checkout/success?orderId=${orderId}`,
    cancel_url: `${frontendUrl}/checkout/cancel?orderId=${orderId}`,
  });

  if (!session.url) {
    throw createHttpError(500, 'Stripe did not return a checkout URL.');
  }

  return session.url;
}

async function fulfillOrder(orderId: number, paymentIntentId: string): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute<OrderLockRow[]>(
      'SELECT status FROM orders WHERE id = ? FOR UPDATE',
      [orderId],
    );

    if (orderRows.length > 0 && orderRows[0].status === 'PENDING_PAYMENT') {
      await connection.execute(
        `UPDATE orders
         SET status = 'PLACED',
             payment_status = 'PAID',
             fulfillment_status = 'UNFULFILLED',
             placed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [orderId],
      );

      await connection.execute<ResultSetHeader>(
        `INSERT INTO payments (order_id, method, status, amount_lkr, stripe_payment_intent_id)
         VALUES (?, 'STRIPE', 'SUCCEEDED', (SELECT total_lkr FROM orders WHERE id = ?), ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           amount_lkr = VALUES(amount_lkr),
           stripe_payment_intent_id = VALUES(stripe_payment_intent_id)`,
        [orderId, orderId, paymentIntentId],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function voidOrder(orderId: number): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute<OrderLockRow[]>(
      'SELECT status FROM orders WHERE id = ? FOR UPDATE',
      [orderId],
    );

    if (orderRows.length === 0 || orderRows[0].status !== 'PENDING_PAYMENT') {
      await connection.commit();
      return;
    }

    await connection.execute(
      "UPDATE orders SET status = 'CANCELLED', payment_status = 'UNPAID' WHERE id = ?",
      [orderId],
    );

    const [items] = await connection.execute<OrderItemForRestockRow[]>(
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ?',
      [orderId],
    );

    for (const item of items) {
      await connection.execute(
        'UPDATE inventory SET quantity = quantity + ? WHERE variant_id = ?',
        [item.quantity, item.variant_id],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default {
  createCheckoutSession,
  fulfillOrder,
  voidOrder,
};
