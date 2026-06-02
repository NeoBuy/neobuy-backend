import type { PoolConnection } from 'mysql2/promise';
import { getPool, setTestTransactionConnection } from '../../src/config/db';

let activeTestConnection: PoolConnection | null = null;

/**
 * Opens a dedicated connection, starts a transaction, and routes all app
 * `query()` / `execute()` / `acquireConnection()` calls through it until rollback.
 *
 * Call in `beforeEach`; pair with `rollbackTestTransaction()` in `afterEach`.
 * Nothing written during the test is committed to disk.
 */
export async function beginTestTransaction(): Promise<void> {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();
  activeTestConnection = connection;
  setTestTransactionConnection(connection);
}

/**
 * Rolls back and releases the test connection. Safe to call if begin was skipped.
 */
export async function rollbackTestTransaction(): Promise<void> {
  const connection = activeTestConnection;
  activeTestConnection = null;
  setTestTransactionConnection(null);

  if (!connection) {
    return;
  }

  try {
    await connection.rollback();
  } finally {
    connection.release();
  }
}
