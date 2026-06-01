import type { ResultSetHeader } from 'mysql2';
import { getPool, query } from '../config/db';
import type { RoleCode } from '../types/auth';
import type {
  CreateUserData,
  MerchantIdRow,
  RoleCodeRow,
  RoleIdRow,
  UserPublicRow,
  UserRow,
} from '../types/database';

async function findByEmailOrPhone(
  email: string | undefined,
  phone: string | undefined,
): Promise<UserRow | undefined> {
  const rows = await query<UserRow>(
    `SELECT * FROM users
     WHERE (email = ? AND email IS NOT NULL)
        OR (phone = ? AND phone IS NOT NULL)
     LIMIT 1`,
    [email ?? null, phone ?? null],
  );
  return rows[0];
}

async function getInternalMerchantId(): Promise<number> {
  const rows = await query<MerchantIdRow>(
    `SELECT id FROM merchants WHERE type = 'INTERNAL' AND status = 'ACTIVE' LIMIT 1`,
  );
  const merchant = rows[0];
  if (!merchant) {
    throw new Error('Internal merchant is not configured.');
  }
  return merchant.id;
}

async function createUserWithRole(
  userData: CreateUserData,
  roleCode: RoleCode,
): Promise<{ id: number; email: string | null; phone: string | null }> {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();

  try {
    const [roleRows] = await connection.execute<RoleIdRow[]>(
      'SELECT id FROM roles WHERE code = ? LIMIT 1',
      [roleCode],
    );
    if (roleRows.length === 0) {
      throw new Error(`Role code ${roleCode} not found in database.`);
    }
    const roleId = roleRows[0].id;

    const [userResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (merchant_id, email, phone, password_hash, status)
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      [userData.merchant_id, userData.email, userData.phone, userData.password_hash],
    );
    const userId = userResult.insertId;

    await connection.execute(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleId],
    );

    await connection.commit();
    return { id: userId, email: userData.email, phone: userData.phone };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getUserRoles(userId: number): Promise<string[]> {
  const rows = await query<RoleCodeRow>(
    `SELECT r.code FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId],
  );
  return rows.map((row) => row.code);
}

async function findById(id: number): Promise<UserPublicRow[]> {
  return query<UserPublicRow>(
    'SELECT id, email, phone, status, merchant_id, created_at FROM users WHERE id = ? LIMIT 1',
    [id],
  );
}

export {
  findByEmailOrPhone,
  getInternalMerchantId,
  createUserWithRole,
  getUserRoles,
  findById,
};
