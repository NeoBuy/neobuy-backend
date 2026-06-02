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

interface InventoryRow extends RowDataPacket {
  quantity: number;
}

describe('Order Checkout Concurrency Engine Stress Test', () => {
  let userA: TestUserFixture;
  let userB: TestUserFixture;
  let catalog: TestCatalogProfile;

  beforeAll(async () => {
    await getTestApp();
    userA = await createTestUser();
    userB = await createTestUser();
    catalog = await createTestProductCatalog();
  });

  afterAll(async () => {
    const pool = getPool();

    // Remove order graphs for test users first.
    await pool.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (?, ?))', [
      userA.id,
      userB.id,
    ]);
    await pool.execute('DELETE FROM orders WHERE user_id IN (?, ?)', [userA.id, userB.id]);
    await pool.execute('DELETE FROM addresses WHERE user_id IN (?, ?)', [userA.id, userB.id]);

    await pool.execute(
      `DELETE ci FROM cart_items ci
       INNER JOIN carts c ON c.id = ci.cart_id
       WHERE c.user_id IN (?, ?)`,
      [userA.id, userB.id],
    );
    await pool.execute('DELETE FROM carts WHERE user_id IN (?, ?)', [userA.id, userB.id]);

    await pool.execute(
      `DELETE wi FROM wishlist_items wi
       INNER JOIN wishlists w ON w.id = wi.wishlist_id
       WHERE w.user_id IN (?, ?)`,
      [userA.id, userB.id],
    );
    await pool.execute('DELETE FROM wishlists WHERE user_id IN (?, ?)', [userA.id, userB.id]);

    await pool.execute('DELETE FROM user_roles WHERE user_id IN (?, ?)', [userA.id, userB.id]);
    await pool.execute('DELETE FROM users WHERE id IN (?, ?)', [userA.id, userB.id]);

    await pool.execute('DELETE FROM inventory WHERE variant_id = ?', [catalog.variantId]);
    await pool.execute('DELETE FROM product_variants WHERE id = ?', [catalog.variantId]);
    await pool.execute('DELETE FROM products WHERE id = ?', [catalog.productId]);
  });

  it('should gracefully serialize simultaneous checkouts and block overselling when stock = 1', async () => {
    await setInventoryQuantity(catalog.variantId, 1);

    await request(await getTestApp())
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ variantId: catalog.variantId, quantity: 1 })
      .expect(200);

    await request(await getTestApp())
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ variantId: catalog.variantId, quantity: 1 })
      .expect(200);

    const [responseUserA, responseUserB] = await Promise.all([
      request(await getTestApp())
        .post('/api/orders')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ shippingAddress: '123 User A Road, Colombo', contactPhone: '0771111111' }),
      request(await getTestApp())
        .post('/api/orders')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ shippingAddress: '456 User B St, Kandy', contactPhone: '0772222222' }),
    ]);

    const statuses = [responseUserA.status, responseUserB.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);

    const failureResponse = responseUserA.status === 400 ? responseUserA.body : responseUserB.body;
    expect(failureResponse.success).toBe(false);
    expect(failureResponse.message).toContain('Stock deficit');

    const stockRows = await query<InventoryRow>(
      'SELECT quantity FROM inventory WHERE variant_id = ? LIMIT 1',
      [catalog.variantId],
    );
    expect(Number(stockRows[0].quantity)).toBe(0);
  });
});
