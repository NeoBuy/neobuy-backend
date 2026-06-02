import type { RowDataPacket } from 'mysql2';
import request from 'supertest';
import { getPool, query } from '../src/config/db';
import { getTestApp } from './helpers/app';
import {
  createTestProductCatalog,
  createTestUser,
  setInventoryQuantity,
  type TestCatalogProfile,
  type TestUserFixture,
} from './helpers/fixtures';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: jest.fn().mockImplementation((body: Buffer) => JSON.parse(body.toString())),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/session_123' }),
      },
    },
  }));
});

interface OrderStatusRow extends RowDataPacket {
  status: string;
  payment_status: string;
}

describe('Stripe Webhook E2E Processing Integration', () => {
  let user: TestUserFixture;
  let catalog: TestCatalogProfile;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key';
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_secret';
    process.env.NEXT_PUBLIC_FRONTEND_URL =
      process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

    await getTestApp();
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

  it('captures checkout.session.completed and marks order as paid/placed', async () => {
    await setInventoryQuantity(catalog.variantId, 10);

    await request(await getTestApp())
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ variantId: catalog.variantId, quantity: 2 })
      .expect(200);

    const orderResponse = await request(await getTestApp())
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ shippingAddress: '789 Stripe Way, Colombo', contactPhone: '0773333333' });
    expect(orderResponse.status).toBe(201);
    const orderId = Number(orderResponse.body?.data?.orderId);
    expect(orderId).toBeGreaterThan(0);

    const fakeWebhookEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          payment_intent: 'pi_test_mock_123456',
          metadata: {
            orderId: orderId.toString(),
          },
        },
      },
    };

    const webhookResponse = await request(await getTestApp())
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=123,v1=mock_signature')
      .send(fakeWebhookEvent);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.received).toBe(true);

    const rows = await query<OrderStatusRow>(
      'SELECT status, payment_status FROM orders WHERE id = ? LIMIT 1',
      [orderId],
    );
    expect(rows[0].status).toBe('PLACED');
    expect(rows[0].payment_status).toBe('PAID');
  });
});
