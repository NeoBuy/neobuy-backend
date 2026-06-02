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

describe('Wishlist API (integration)', () => {
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

  it('1. rejects GET /api/wishlist without authentication', async () => {
    const res = await request(app).get('/api/wishlist');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('2. returns an empty wishlist for a new user', async () => {
    const user = await createTestUser();
    const res = await request(app).get('/api/wishlist').set(authHeader(user.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('3–6. supports wishlist toggle lifecycle', async () => {
    const user = await createTestUser();

    const addRes = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId });
    expect(addRes.status).toBe(200);
    expect(addRes.body.action).toBe('ADDED');

    const withItem = await request(app).get('/api/wishlist').set(authHeader(user.token));
    expect(withItem.body.data).toHaveLength(1);
    expect(withItem.body.data[0].variant_id).toBe(catalog.variantId);

    const removeRes = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId });
    expect(removeRes.body.action).toBe('REMOVED');

    const empty = await request(app).get('/api/wishlist').set(authHeader(user.token));
    expect(empty.body.data).toEqual([]);
  });

  it('7. rejects toggle without variantId in body', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/variantId/i);
  });

  it('8. returns 404 when toggling a non-existent variant', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post('/api/wishlist/toggle')
      .set(authHeader(user.token))
      .send({ variantId: 999999999 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
