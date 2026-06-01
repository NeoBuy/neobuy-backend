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

describe('Wishlist API (integration)', () => {
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

  it('1. rejects GET /api/wishlist without authentication', async () => {
    const res = await request(app).get('/api/wishlist');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('2. returns an empty wishlist for a new user', async () => {
    const res = await request(app).get('/api/wishlist').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('3. toggles a variant ON via POST /api/wishlist/toggle', async () => {
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('ADDED');
    expect(res.body.message).toMatch(/appended/i);
  });

  it('4. lists the wishlist with the saved variant', async () => {
    const res = await request(app).get('/api/wishlist').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const item = res.body.data[0];
    expect(item.variant_id).toBe(catalog.variantId);
    expect(item.sku).toBe(catalog.sku);
    expect(item.product_title).toBeTruthy();
    expect(item.price_lkr).toBeGreaterThan(0);
  });

  it('5. toggles the same variant OFF', async () => {
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('REMOVED');
    expect(res.body.message).toMatch(/purged/i);
  });

  it('6. returns an empty wishlist after toggle off', async () => {
    const res = await request(app).get('/api/wishlist').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('7. rejects toggle without variantId in body', async () => {
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/variantId/i);
  });

  it('8. returns 404 when toggling a non-existent variant', async () => {
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: 999999999 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
