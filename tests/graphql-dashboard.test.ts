import type { ResultSetHeader } from 'mysql2';
import request from 'supertest';
import { getPool } from '../src/config/db';
import { getTestApp } from './helpers/app';
import {
  createTestProductCatalog,
  createTestUser,
  type TestCatalogProfile,
  type TestUserFixture,
} from './helpers/fixtures';

describe('GraphQL User Dashboard & Order History Integration Suite', () => {
  let user: TestUserFixture;
  let catalog: TestCatalogProfile;

  beforeAll(async () => {
    await getTestApp({ enableGraphql: true });
    user = await createTestUser();
    catalog = await createTestProductCatalog();
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)', [
      user.id,
    ]);
    await pool.execute('DELETE FROM orders WHERE user_id = ?', [user.id]);
    await pool.execute(
      `DELETE wi FROM wishlist_items wi
       INNER JOIN wishlists w ON wi.wishlist_id = w.id
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

  it('should return an UNAUTHENTICATED error message when token header is omitted', async () => {
    const queryPayload = {
      query: `
        query GetDashboardProfile {
          me {
            fullName
            email
          }
        }
      `,
    };

    const response = await request(await getTestApp({ enableGraphql: true }))
      .post('/graphql')
      .send(queryPayload);

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toContain('UNAUTHENTICATED');
    expect(response.body.data).toBeNull();
  });

  it('should successfully resolve profile fields, orders array, and wishlist counts with a valid token', async () => {
    const pool = getPool();
    const orderNumber = `NB-TEST-DASH-${Date.now()}`;

    const [orderResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO orders
         (user_id, order_number, currency, status, payment_status, fulfillment_status,
          subtotal_lkr, discount_lkr, shipping_lkr, total_lkr)
       VALUES
         (?, ?, 'LKR', 'PLACED', 'PAID', 'UNFULFILLED', 1500, 0, 0, 1500)`,
      [user.id, orderNumber],
    );
    const orderId = orderResult.insertId;

    const [wishlistResult] = await pool.execute<ResultSetHeader>(
      'INSERT INTO wishlists (user_id) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [user.id],
    );
    const wishlistId = wishlistResult.insertId;
    await pool.execute('INSERT IGNORE INTO wishlist_items (wishlist_id, variant_id) VALUES (?, ?)', [
      wishlistId,
      catalog.variantId,
    ]);

    const queryPayload = {
      query: `
        query GetFullDashboard {
          me {
            id
            fullName
            email
            wishlistCount
            orders {
              id
              orderNumber
              totalLkr
              status
              paymentStatus
              fulfillmentStatus
            }
          }
        }
      `,
    };

    const response = await request(await getTestApp({ enableGraphql: true }))
      .post('/graphql')
      .set('Authorization', `Bearer ${user.token}`)
      .send(queryPayload);

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const meData = response.body.data.me as {
      id: string;
      fullName: string;
      email: string;
      wishlistCount: number;
      orders: Array<{
        id: string;
        orderNumber: string;
        totalLkr: number;
        status: string;
        paymentStatus: string;
        fulfillmentStatus: string;
      }>;
    };

    expect(meData).toBeDefined();
    expect(Number(meData.id)).toBe(user.id);
    expect(meData.email).toBe(user.email);
    expect(meData.wishlistCount).toBe(1);
    expect(meData.fullName).toBeTruthy();

    expect(meData.orders.length).toBeGreaterThanOrEqual(1);
    const resolvedOrder = meData.orders.find((o) => Number(o.id) === orderId);
    expect(resolvedOrder).toBeDefined();
    expect(resolvedOrder?.orderNumber).toBe(orderNumber);
    expect(resolvedOrder?.status).toBe('PLACED');
    expect(resolvedOrder?.paymentStatus).toBe('PAID');
    expect(resolvedOrder?.fulfillmentStatus).toBe('UNFULFILLED');

    await pool.execute('DELETE FROM wishlist_items WHERE wishlist_id = ?', [wishlistId]);
    await pool.execute('DELETE FROM wishlists WHERE id = ?', [wishlistId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });
});
