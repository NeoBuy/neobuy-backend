import type { ExecuteValues } from 'mysql2';
import mysql, {
  type Pool,
  type PoolConnection,
  type QueryResult,
  type RowDataPacket,
} from 'mysql2/promise';

let pool: Pool | undefined;

/** When set, all queries run on this connection inside an open test transaction. */
let testTransactionConnection: PoolConnection | null = null;

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

function isTestTransactionActive(): boolean {
  return testTransactionConnection !== null;
}

function setTestTransactionConnection(connection: PoolConnection | null): void {
  testTransactionConnection = connection;
}

async function execute(
  sql: string,
  params?: ExecuteValues,
): Promise<[QueryResult, unknown]> {
  if (testTransactionConnection) {
    return testTransactionConnection.execute(sql, params);
  }
  return getPool().execute(sql, params);
}

async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: ExecuteValues,
): Promise<T[]> {
  const [rows] = await execute(sql, params);
  return rows as T[];
}

interface AcquiredConnection {
  connection: PoolConnection;
  /** When false, caller must not release (shared test transaction connection). */
  owned: boolean;
}

async function acquireConnection(): Promise<AcquiredConnection> {
  if (testTransactionConnection) {
    return { connection: testTransactionConnection, owned: false };
  }
  const connection = await getPool().getConnection();
  return { connection, owned: true };
}

async function releaseConnection(connection: PoolConnection, owned: boolean): Promise<void> {
  if (owned) {
    connection.release();
  }
}

export {
  getPool,
  query,
  execute,
  acquireConnection,
  releaseConnection,
  isTestTransactionActive,
  setTestTransactionConnection,
};
