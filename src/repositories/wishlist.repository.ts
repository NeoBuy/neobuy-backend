import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import {
  acquireConnection,
  execute,
  isTestTransactionActive,
  releaseConnection,
} from '../config/db';
import type { WishlistItemResponse, WishlistToggleResult } from '../types/wishlist';

interface WishlistIdRow extends RowDataPacket {
  id: number;
}

interface WishlistItemIdRow extends RowDataPacket {
  id: number;
}

interface WishlistItemRow extends RowDataPacket {
  id: number;
  product_id: number;
  variant_id: number;
  product_title: string;
  variant_title: string | null;
  price_lkr: number;
  sku: string;
  primary_image_url: string | null;
}

async function getOrCreateWishlistId(userId: number, connection: PoolConnection): Promise<number> {
  const [rows] = await connection.execute<WishlistIdRow[]>(
    'SELECT id FROM wishlists WHERE user_id = ? LIMIT 1',
    [userId],
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const [result] = await connection.execute<ResultSetHeader>(
    'INSERT INTO wishlists (user_id) VALUES (?)',
    [userId],
  );
  return result.insertId;
}

async function toggleItemOnConnection(
  userId: number,
  variantId: number,
  connection: PoolConnection,
): Promise<WishlistToggleResult> {
  const wishlistId = await getOrCreateWishlistId(userId, connection);

  const [existing] = await connection.execute<WishlistItemIdRow[]>(
    'SELECT id FROM wishlist_items WHERE wishlist_id = ? AND variant_id = ? LIMIT 1',
    [wishlistId, variantId],
  );

  if (existing.length > 0) {
    await connection.execute(
      'DELETE FROM wishlist_items WHERE wishlist_id = ? AND variant_id = ?',
      [wishlistId, variantId],
    );
    return { action: 'REMOVED' };
  }

  await connection.execute(
    'INSERT INTO wishlist_items (wishlist_id, variant_id) VALUES (?, ?)',
    [wishlistId, variantId],
  );
  return { action: 'ADDED' };
}

async function toggleItem(userId: number, variantId: number): Promise<WishlistToggleResult> {
  if (isTestTransactionActive()) {
    const { connection, owned } = await acquireConnection();
    try {
      return await toggleItemOnConnection(userId, variantId, connection);
    } finally {
      await releaseConnection(connection, owned);
    }
  }

  const { connection, owned } = await acquireConnection();
  try {
    await connection.beginTransaction();
    const result = await toggleItemOnConnection(userId, variantId, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await releaseConnection(connection, owned);
  }
}

async function getUserWishlist(userId: number): Promise<WishlistItemResponse[]> {
  const [rows] = await execute(
    `SELECT
       wi.id,
       pv.product_id,
       wi.variant_id,
       p.title AS product_title,
       pv.title AS variant_title,
       pv.price_lkr,
       pv.sku,
       (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS primary_image_url
     FROM wishlists w
     INNER JOIN wishlist_items wi ON wi.wishlist_id = w.id
     INNER JOIN product_variants pv ON wi.variant_id = pv.id
     INNER JOIN products p ON pv.product_id = p.id
     WHERE w.user_id = ? AND p.status = 'ACTIVE' AND pv.status = 'ACTIVE'
     ORDER BY wi.created_at DESC`,
    [userId],
  );
  const itemRows = rows as WishlistItemRow[];

  return itemRows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    product_title: row.product_title,
    variant_title: row.variant_title,
    price_lkr: Number(row.price_lkr),
    sku: row.sku,
    primary_image_url: row.primary_image_url,
  }));
}

export default {
  toggleItem,
  getUserWishlist,
};
