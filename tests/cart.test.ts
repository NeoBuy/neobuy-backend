import type { Express } from 'express';
import request from 'supertest';
import { getTestApp } from './helpers/app';
import {
  authHeader,
  cleanupTestUser,
  createTestUser,
  ensureTestCatalog,
  type TestCatalogFixture,
  type TestUserFixture,
} from './helpers/fixtures';

describe('Cart API (integration)', () => {
  let app: Express;
  let user: TestUserFixture;
  let catalog: TestCatalogFixture;

  beforeAll(async () => {
    app = await getTestApp();
    user = await createTestUser();
    catalog = await ensureTestCatalog();
  });

  afterAll(async () => {
    await cleanupTestUser(user.id);
  });

  it('1. rejects GET /api/cart without authentication', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('2. returns an empty active cart for a new user', async () => {
    const res = await request(app).get('/api/cart').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.subtotal_lkr).toBe(0);
    expect(typeof res.body.data.id).toBe('number');
  });

  it('3. adds an item via POST /api/cart/items', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/appended/i);
  });

  it('4. returns the cart with the added line item', async () => {
    const res = await request(app).get('/api/cart').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);

    const line = res.body.data.items[0];
    expect(line.variant_id).toBe(catalog.variantId);
    expect(line.sku).toBe(catalog.sku);
    expect(line.quantity).toBe(2);
    expect(line.line_total_lkr).toBe(line.price_lkr * 2);
    expect(res.body.data.subtotal_lkr).toBe(line.line_total_lkr);
  });

  it('5. increments quantity when adding the same variant again', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 1 });

    expect(res.status).toBe(200);

    const cartRes = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(cartRes.body.data.items[0].quantity).toBe(3);
  });

  it('6. updates quantity via PUT /api/cart/items/:variantId', async () => {
    const res = await request(app)
      .put(`/api/cart/items/${catalog.variantId}`)
      .set(authHeader(user.token))
      .send({ quantity: 4 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cartRes = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(cartRes.body.data.items[0].quantity).toBe(4);
    expect(cartRes.body.data.subtotal_lkr).toBe(cartRes.body.data.items[0].price_lkr * 4);
  });

  it('7. rejects POST /api/cart/items without variantId', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('8. removes the item via DELETE /api/cart/items/:variantId', async () => {
    const res = await request(app)
      .delete(`/api/cart/items/${catalog.variantId}`)
      .set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/purged/i);
  });

  it('9. returns an empty cart after removal', async () => {
    const res = await request(app).get('/api/cart').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.subtotal_lkr).toBe(0);
  });
});
