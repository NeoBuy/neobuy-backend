import type { RowDataPacket } from 'mysql2';
import type { Express } from 'express';
import request from 'supertest';
import { execute, query } from '../src/config/db';
import { getTestApp } from './helpers/app';
import {
  authHeader,
  createTestUser,
  ensureTestCatalog,
  getInventoryQuantity,
  setInventoryQuantity,
  type TestCatalogFixture,
} from './helpers/fixtures';
import { beginTestTransaction, rollbackTestTransaction } from './helpers/transaction';

interface OrderCountRow extends RowDataPacket {
  total: number;
}

interface OrderTotalsRow extends RowDataPacket {
  total_lkr: number;
  subtotal_lkr: number;
}

describe('Order API (integration)', () => {
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

  it('rejects checkout when cart is empty', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(user.token))
      .send({ shippingAddress: '123 Main St', contactPhone: '+94770000000' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty shopping cart/i);
  });

  it('creates order, locks stock, and transitions cart to ORDERED', async () => {
    const user = await createTestUser();

    await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 2 })
      .expect(200);

    const beforeQty = await getInventoryQuantity(catalog.variantId);

    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeader(user.token))
      .send({ shippingAddress: '45 Flower Rd, Colombo', contactPhone: '+94771234567' });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);
    expect(orderRes.body.data.orderNumber).toMatch(/^NB-/);
    expect(orderRes.body.data.items).toHaveLength(1);
    expect(orderRes.body.data.items[0].variantId).toBe(catalog.variantId);
    expect(orderRes.body.data.status).toBe('PENDING_PAYMENT');

    const afterQty = await getInventoryQuantity(catalog.variantId);
    expect(afterQty).toBe(beforeQty - 2);

    const cartRes = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.data.items).toEqual([]);
  });

  it('rolls back all writes on stock deficit during checkout', async () => {
    const user = await createTestUser();

    await setInventoryQuantity(catalog.variantId, 5);

    await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 2 })
      .expect(200);
    await setInventoryQuantity(catalog.variantId, 1);

    const baselineQty = await getInventoryQuantity(catalog.variantId);
    const countBefore = await query<OrderCountRow>(
      'SELECT COUNT(*) AS total FROM orders WHERE user_id = ?',
      [user.id],
    );

    const failRes = await request(app)
      .post('/api/orders')
      .set(authHeader(user.token))
      .send({ shippingAddress: 'Deficit Lane', contactPhone: '+94778889999' });

    expect(failRes.status).toBe(400);
    expect(failRes.body.success).toBe(false);
    expect(failRes.body.message).toMatch(/stock deficit/i);

    const countAfter = await query<OrderCountRow>(
      'SELECT COUNT(*) AS total FROM orders WHERE user_id = ?',
      [user.id],
    );
    expect(countAfter[0].total).toBe(countBefore[0].total);

    const qtyAfter = await getInventoryQuantity(catalog.variantId);
    expect(qtyAfter).toBe(baselineQty);
  });

  it('uses live locked variant pricing during checkout (price drift safe)', async () => {
    const user = await createTestUser();

    await setInventoryQuantity(catalog.variantId, 5);
    await query('UPDATE product_variants SET price_lkr = ? WHERE id = ?', [1000, catalog.variantId]);

    await request(app)
      .post('/api/cart/items')
      .set(authHeader(user.token))
      .send({ variantId: catalog.variantId, quantity: 2 })
      .expect(200);

    await query('UPDATE product_variants SET price_lkr = ? WHERE id = ?', [4500, catalog.variantId]);

    const checkoutResponse = await request(app)
      .post('/api/orders')
      .set(authHeader(user.token))
      .send({ shippingAddress: 'Price Drift Testing Grounds, Colombo', contactPhone: '0775555555' });

    expect(checkoutResponse.status).toBe(201);
    const orderId = Number(checkoutResponse.body.data.orderId);

    const totals = await query<OrderTotalsRow>(
      'SELECT total_lkr, subtotal_lkr FROM orders WHERE id = ? LIMIT 1',
      [orderId],
    );

    expect(Number(totals[0].total_lkr)).toBe(9000);
    expect(Number(totals[0].subtotal_lkr)).toBe(9000);
  });

  it('returns structured stock outage payload for multi-variant style checkout failures', async () => {
    const user = await createTestUser();

    await setInventoryQuantity(catalog.variantId, 1);

    const cartRes = await request(app).get('/api/cart').set(authHeader(user.token));
    expect(cartRes.status).toBe(200);
    const cartId = Number(cartRes.body.data.id);
    expect(cartId).toBeGreaterThan(0);

    await execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    await execute(
      'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)',
      [cartId, catalog.variantId, 5],
    );

    const response = await request(app)
      .post('/api/orders')
      .set(authHeader(user.token))
      .send({ shippingAddress: 'Stock Outage Probe Address', contactPhone: '0776666666' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('STOCK_OUTAGE');
    expect(response.body.errorDetails).toBeDefined();

    const details = response.body.errorDetails as {
      variantId: number;
      sku: string;
      productTitle: string;
      variantTitle: string | null;
      availableStock: number;
      requestedQuantity: number;
    };
    expect(details.variantId).toBe(catalog.variantId);
    expect(details.sku).toBe(catalog.sku);
    expect(details.availableStock).toBe(1);
    expect(details.requestedQuantity).toBe(5);
    expect(typeof details.productTitle).toBe('string');
  });
});
