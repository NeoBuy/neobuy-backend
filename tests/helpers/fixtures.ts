import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { getPool } from '../../src/config/db';
import { signAuthToken } from '../../src/utils/jwt';

interface IdRow extends RowDataPacket {
  id: number;
}

interface VariantRow extends RowDataPacket {
  id: number;
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

const TEST_PASSWORD = 'JestTestPass123!';

export async function createTestUser(): Promise<TestUserFixture> {
  const pool = getPool();
  const email = `jest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neobuy.test`;
  const password_hash = await bcrypt.hash(TEST_PASSWORD, 10);

  const [merchantRows] = await pool.execute<IdRow[]>(
    "SELECT id FROM merchants WHERE type = 'INTERNAL' LIMIT 1",
  );
  const merchantId = merchantRows[0]?.id;
  if (!merchantId) {
    throw new Error('No internal merchant found. Run migrations and seed first.');
  }

  const connection = await pool.getConnection();
  let userId: number;

  try {
    await connection.beginTransaction();

    const [userResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (merchant_id, email, password_hash, status) VALUES (?, ?, ?, 'ACTIVE')`,
      [merchantId, email, password_hash],
    );
    userId = userResult.insertId;

    const [roleRows] = await connection.execute<IdRow[]>(
      "SELECT id FROM roles WHERE code = 'CUSTOMER' LIMIT 1",
    );
    if (!roleRows[0]) {
      throw new Error('CUSTOMER role not found.');
    }

    await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleRows[0].id,
    ]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const token = signAuthToken({
    id: userId,
    email,
    phone: null,
    roles: ['CUSTOMER'],
  });

  return { id: userId, email, token };
}

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

export async function cleanupTestUser(userId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `DELETE ci FROM cart_items ci
     INNER JOIN carts c ON c.id = ci.cart_id
     WHERE c.user_id = ?`,
    [userId],
  );
  await pool.execute('DELETE FROM carts WHERE user_id = ?', [userId]);
  await pool.execute(
    `DELETE wi FROM wishlist_items wi
     INNER JOIN wishlists w ON w.id = wi.wishlist_id
     WHERE w.user_id = ?`,
    [userId],
  );
  await pool.execute('DELETE FROM wishlists WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
