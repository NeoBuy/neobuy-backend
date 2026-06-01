import type { RowDataPacket } from 'mysql2';
import { query } from '../config/db';
import wishlistRepository from '../repositories/wishlist.repository';
import type { WishlistItemResponse, WishlistToggleResult } from '../types/wishlist';
import { createHttpError } from '../utils/http-error';

interface VariantActiveRow extends RowDataPacket {
  id: number;
}

async function assertVariantActive(variantId: number): Promise<void> {
  const rows = await query<VariantActiveRow>(
    `SELECT pv.id
     FROM product_variants pv
     INNER JOIN products p ON pv.product_id = p.id
     WHERE pv.id = ? AND pv.status = 'ACTIVE' AND p.status = 'ACTIVE'
     LIMIT 1`,
    [variantId],
  );
  if (!rows[0]) {
    throw createHttpError(404, 'Product variant not found or has been disabled.');
  }
}

async function toggleWishlist(userId: number, variantId: number): Promise<WishlistToggleResult> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw createHttpError(400, 'Invalid variant id.');
  }

  await assertVariantActive(variantId);
  return wishlistRepository.toggleItem(userId, variantId);
}

async function getWishlist(userId: number): Promise<WishlistItemResponse[]> {
  return wishlistRepository.getUserWishlist(userId);
}

export default {
  toggleWishlist,
  getWishlist,
};
