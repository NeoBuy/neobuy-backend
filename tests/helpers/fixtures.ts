import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { execute, getPool, query } from '../../src/config/db';
import { signAuthToken } from '../../src/utils/jwt';

interface IdRow extends RowDataPacket {
  id: number;
}

interface VariantRow extends RowDataPacket {
  id: number;
  sku: string;
}

interface InventoryQtyRow extends RowDataPacket {
  quantity: number;
}

export interface TestUserFixture {
  id: number;
  email: string;
  token: string;
}

export interface TestCatalogFixture {
  variantId: number;
  sku: string;
}

export interface TestCatalogProfile {
  productId: number;
  variantId: number;
  sku: string;
}

/**
 * Ensures a committed catalog row exists for integration tests.
 * Run in `beforeAll` (outside per-test transactions) so variants remain visible
 * across rollbacks. Inserts only when no suitable variant exists.
 */
export async function ensureTestCatalog(): Promise<TestCatalogFixture> {
  const pool = getPool();

  const [existing] = await pool.execute<VariantRow[]>(
    `SELECT pv.id, pv.sku
     FROM product_variants pv
     INNER JOIN products p ON p.id = pv.product_id
     INNER JOIN inventory i ON i.variant_id = pv.id
     WHERE p.status = 'ACTIVE' AND pv.status = 'ACTIVE' AND i.quantity >= 20
     LIMIT 1`,
  );

  if (existing[0]) {
    return { variantId: existing[0].id, sku: existing[0].sku };
  }

  const [merchantRows] = await pool.execute<IdRow[]>(
    "SELECT id FROM merchants WHERE type = 'INTERNAL' LIMIT 1",
  );
  const merchantId = merchantRows[0]?.id;
  if (!merchantId) {
    throw new Error('No internal merchant found.');
  }

  const sku = `JEST-SKU-${Date.now()}`;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO products (merchant_id, title, description, status)
       VALUES (?, 'Jest Test Product', 'Integration test catalog item', 'ACTIVE')`,
      [merchantId],
    );
    const productId = productResult.insertId;

    const [variantResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO product_variants (product_id, sku, title, price_lkr, status)
       VALUES (?, ?, 'Jest Test Variant', 1500, 'ACTIVE')`,
      [productId, sku],
    );
    const variantId = variantResult.insertId;

    await connection.execute(
      'INSERT INTO inventory (variant_id, quantity) VALUES (?, ?)',
      [variantId, 50],
    );

    await connection.commit();
    return { variantId, sku };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createTestProductCatalog(): Promise<TestCatalogProfile> {
  const pool = getPool();
  const [merchantRows] = await pool.execute<IdRow[]>(
    "SELECT id FROM merchants WHERE type = 'INTERNAL' LIMIT 1",
  );
  const merchantId = merchantRows[0]?.id;
  if (!merchantId) {
    throw new Error('No internal merchant found.');
  }

  const sku = `JEST-CONC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [productResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO products (merchant_id, title, description, status)
       VALUES (?, 'Jest Concurrency Product', 'Concurrency stress catalog', 'ACTIVE')`,
      [merchantId],
    );
    const productId = productResult.insertId;

    const [variantResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO product_variants (product_id, sku, title, price_lkr, status)
       VALUES (?, ?, 'Concurrency Variant', 2500, 'ACTIVE')`,
      [productId, sku],
    );
    const variantId = variantResult.insertId;

    await connection.execute('INSERT INTO inventory (variant_id, quantity) VALUES (?, ?)', [
      variantId,
      5,
    ]);

    await connection.commit();
    return { productId, variantId, sku };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Creates a user inside the current test transaction (rolled back after each test). */
export async function createTestUser(): Promise<TestUserFixture> {
  const email = `jest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neobuy.test`;
  const password_hash = await bcrypt.hash('JestTestPass123!', 10);

  const merchantRows = await query<IdRow>(
    "SELECT id FROM merchants WHERE type = 'INTERNAL' LIMIT 1",
  );
  const merchantId = merchantRows[0]?.id;
  if (!merchantId) {
    throw new Error('No internal merchant found. Run migrations and seed first.');
  }

  const [userResult] = await execute(
    `INSERT INTO users (merchant_id, email, password_hash, status) VALUES (?, ?, ?, 'ACTIVE')`,
    [merchantId, email, password_hash],
  );
  const userId = (userResult as ResultSetHeader).insertId;

  const roleRows = await query<IdRow>("SELECT id FROM roles WHERE code = 'CUSTOMER' LIMIT 1");
  if (!roleRows[0]) {
    throw new Error('CUSTOMER role not found.');
  }

  await query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id]);

  const token = signAuthToken({
    id: userId,
    email,
    phone: null,
    roles: ['CUSTOMER'],
  });

  return { id: userId, email, token };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function getInventoryQuantity(variantId: number): Promise<number> {
  const rows = await query<InventoryQtyRow>(
    'SELECT quantity FROM inventory WHERE variant_id = ? LIMIT 1',
    [variantId],
  );
  return Number(rows[0]?.quantity ?? 0);
}

export async function setInventoryQuantity(variantId: number, quantity: number): Promise<void> {
  await execute('UPDATE inventory SET quantity = ? WHERE variant_id = ?', [quantity, variantId]);
}
