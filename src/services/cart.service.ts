import type { RowDataPacket } from 'mysql2';
import { query } from '../config/db';
import cartRepository from '../repositories/cart.repository';
import type { CartResponse } from '../types/cart';
import { createHttpError } from '../utils/http-error';

interface StockRow extends RowDataPacket {
  quantity: number;
}

interface VariantActiveRow extends RowDataPacket {
  id: number;
}

async function getAvailableStock(variantId: number): Promise<number> {
  const rows = await query<StockRow>(
    `SELECT COALESCE(i.quantity, 0) AS quantity
     FROM product_variants pv
     LEFT JOIN inventory i ON i.variant_id = pv.id
     INNER JOIN products p ON p.id = pv.product_id
     WHERE pv.id = ? AND pv.status = 'ACTIVE' AND p.status = 'ACTIVE'
     LIMIT 1`,
    [variantId],
  );
  if (!rows[0]) {
    throw createHttpError(404, 'Product variant not found or unavailable.');
  }
  return Number(rows[0].quantity);
}

async function assertVariantPurchasable(variantId: number): Promise<void> {
  const rows = await query<VariantActiveRow>(
    `SELECT pv.id
     FROM product_variants pv
     INNER JOIN products p ON p.id = pv.product_id
     WHERE pv.id = ? AND pv.status = 'ACTIVE' AND p.status = 'ACTIVE'
     LIMIT 1`,
    [variantId],
  );
  if (!rows[0]) {
    throw createHttpError(404, 'Product variant not found or unavailable.');
  }
}

async function addItem(userId: number, variantId: number, quantity: number): Promise<void> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw createHttpError(400, 'Invalid variant id.');
  }
  if (quantity <= 0) {
    throw createHttpError(400, 'Quantity must be greater than zero.');
  }

  await assertVariantPurchasable(variantId);
  const availableStock = await getAvailableStock(variantId);

  const cartId = await cartRepository.getOrCreateActiveCart(userId);
  const currentQty = await cartRepository.getLineQuantity(cartId, variantId);
  const requestedTotal = currentQty + quantity;

  if (requestedTotal > availableStock) {
    throw createHttpError(
      400,
      `Insufficient stock available. Only ${availableStock} units remain.`,
    );
  }

  await cartRepository.addItemToCart(cartId, variantId, quantity);
}

async function updateItem(userId: number, variantId: number, quantity: number): Promise<void> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw createHttpError(400, 'Invalid variant id.');
  }

  if (quantity <= 0) {
    await removeItem(userId, variantId);
    return;
  }

  await assertVariantPurchasable(variantId);
  const availableStock = await getAvailableStock(variantId);

  if (quantity > availableStock) {
    throw createHttpError(
      400,
      `Cannot modify quantity. Only ${availableStock} items are available in stock.`,
    );
  }

  const cartId = await cartRepository.getOrCreateActiveCart(userId);
  await cartRepository.updateItemQuantity(cartId, variantId, quantity);
}

async function removeItem(userId: number, variantId: number): Promise<void> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw createHttpError(400, 'Invalid variant id.');
  }

  const cartId = await cartRepository.getOrCreateActiveCart(userId);
  await cartRepository.removeItemFromCart(cartId, variantId);
}

async function getCart(userId: number): Promise<CartResponse> {
  const cart = await cartRepository.getDetailedCart(userId);
  if (!cart) {
    const newCartId = await cartRepository.getOrCreateActiveCart(userId);
    return { id: newCartId, status: 'ACTIVE', items: [], subtotal_lkr: 0 };
  }
  return cart;
}

export default {
  addItem,
  updateItem,
  removeItem,
  getCart,
};
