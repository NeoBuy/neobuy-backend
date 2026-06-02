import type { Express } from 'express';
import request from 'supertest';
import { getTestApp } from './helpers/app';
import {
  authHeader,
  createTestUser,
  ensureTestCatalog,
  type TestCatalogFixture,
} from './helpers/fixtures';
import { beginTestTransaction, rollbackTestTransaction } from './helpers/transaction';

describe('Cart API (integration)', () => {
  let app: Express;
  let catalog: TestCatalogFixture;

  beforeAll(async () => {
    app = await getTestApp();
    catalog = await ensureTestCatalog();
  });

  beforeEach(async () => {
    await beginTestTransaction();
  });

  afterEach(async () => {
    await rollbackTestTransaction();
  });

  it('1. rejects GET /api/cart without authentication', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('2. returns an empty active cart for a new user', async () => {
    const user = await createTestUser();
    const res = await request(app).get('/api/cart').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.subtotal_lkr).toBe(0);
    expect(typeof res.body.data.id).toBe('number');
  });

  it('3–9. supports full cart CRUD lifecycle', async () => {
    const user = await createTestUser();

    const addRes = await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 2 });
    expect(addRes.status).toBe(200);
    expect(addRes.body.success).toBe(true);

    const cartWithItem = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(cartWithItem.body.data.items).toHaveLength(1);
    const line = cartWithItem.body.data.items[0];
    expect(line.variant_id).toBe(catalog.variantId);
    expect(line.quantity).toBe(2);

    await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 1 });

    const incremented = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(incremented.body.data.items[0].quantity).toBe(3);

    const updateRes = await request(app)
      .put(`/api/cart/items/${catalog.variantId}`)
      .set(authHeader(user.token))
      .send({ quantity: 4 });
    expect(updateRes.status).toBe(200);

    const updated = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(updated.body.data.items[0].quantity).toBe(4);

    const missingVariant = await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ quantity: 1 });
    expect(missingVariant.status).toBe(400);

    const removeRes = await request(app)
      .delete(`/api/cart/items/${catalog.variantId}`)
      .set(authHeader(user.token));
    expect(removeRes.status).toBe(200);

    const emptyCart = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(emptyCart.body.data.items).toEqual([]);
    expect(emptyCart.body.data.subtotal_lkr).toBe(0);
  });
});
