import type { RequestHandler } from 'express';
import wishlistService from '../services/wishlist.service';
import { isHttpError } from '../utils/http-error';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

function errorStatus(error: unknown, fallback: number): number {
  return isHttpError(error) && error.status ? error.status : fallback;
}

const getWishlist: RequestHandler = async (req, res) => {
  try {
    const items = await wishlistService.getWishlist(req.user!.id);
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    res.status(errorStatus(error, 500)).json({ success: false, message: errorMessage(error) });
  }
};

interface ToggleWishlistBody {
  variantId?: number;
}

const toggleWishlistItem: RequestHandler = async (req, res) => {
  try {
    const { variantId } = req.body as ToggleWishlistBody;
    if (!variantId) {
      res.status(400).json({ success: false, message: 'variantId is required inside the payload body.' });
      return;
    }

    const result = await wishlistService.toggleWishlist(req.user!.id, Number(variantId));
    const message =
      result.action === 'ADDED'
        ? 'Item successfully appended to wishlist.'
        : 'Item purged from wishlist.';

    res.status(200).json({ success: true, action: result.action, message });
  } catch (error) {
    res.status(errorStatus(error, 400)).json({ success: false, message: errorMessage(error) });
  }
};

export { getWishlist, toggleWishlistItem };
