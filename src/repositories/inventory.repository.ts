import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { acquireConnection, releaseConnection } from '../config/db';
import { createHttpError } from '../utils/http-error';

interface VariantPriceRow extends RowDataPacket {
  price_lkr: number;
}

async function changeVariantPrice(variantId: number, newPrice: number): Promise<void> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw createHttpError(400, 'Invalid variant id.');
  }
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    throw createHttpError(400, 'Price must be a non-negative number.');
  }

  const normalizedPrice = Math.round(newPrice);
  const { connection, owned } = await acquireConnection();

  try {
    if (owned) {
      await connection.beginTransaction();
    }

    const [rows] = await connection.execute<VariantPriceRow[]>(
      'SELECT price_lkr FROM product_variants WHERE id = ? FOR UPDATE',
      [variantId],
    );

    if (rows.length === 0) {
      throw createHttpError(404, 'Catalog variant item not found.');
    }

    const oldPrice = Number(rows[0].price_lkr);
    if (oldPrice === normalizedPrice) {
      if (owned) {
        await connection.commit();
      }
      return;
    }

    await connection.execute(
      'UPDATE product_variants SET price_lkr = ? WHERE id = ?',
      [normalizedPrice, variantId],
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO product_price_history (variant_id, old_price_lkr, new_price_lkr)
       VALUES (?, ?, ?)`,
      [variantId, oldPrice, normalizedPrice],
    );

    if (owned) {
      await connection.commit();
    }
  } catch (error) {
    if (owned) {
      await connection.rollback();
    }
    throw error;
  } finally {
    await releaseConnection(connection, owned);
  }
}

export default {
  changeVariantPrice,
};
