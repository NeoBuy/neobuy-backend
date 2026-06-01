import type { ExecuteValues } from 'mysql2';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z',
    });
  }
  return pool;
}

async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: ExecuteValues,
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

export { getPool, query };
