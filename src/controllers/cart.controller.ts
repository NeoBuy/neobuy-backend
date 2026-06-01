import type { RequestHandler } from 'express';
import cartService from '../services/cart.service';
import type { AddToCartInput, UpdateCartItemInput } from '../types/cart';
import { isHttpError } from '../utils/http-error';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

function errorStatus(error: unknown, fallback: number): number {
  return isHttpError(error) && error.status ? error.status : fallback;
}

const getCart: RequestHandler = async (req, res) => {
  try {
    const cart = await cartService.getCart(req.user!.id);
    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    res.status(errorStatus(error, 500)).json({ success: false, message: errorMessage(error) });
  }
};

const addItem: RequestHandler = async (req, res) => {
  try {
    const { variantId, quantity } = req.body as AddToCartInput;
    if (!variantId) {
      res.status(400).json({ success: false, message: 'variantId is required.' });
      return;
    }
    await cartService.addItem(req.user!.id, Number(variantId), Number(quantity ?? 1));
    res.status(200).json({ success: true, message: 'Item appended to cart successfully.' });
  } catch (error) {
    res.status(errorStatus(error, 400)).json({ success: false, message: errorMessage(error) });
  }
};

const updateItem: RequestHandler = async (req, res) => {
  try {
    const variantId = Number(req.params.variantId);
    const { quantity } = req.body as UpdateCartItemInput;
    if (quantity === undefined || quantity === null) {
      res.status(400).json({ success: false, message: 'quantity is required.' });
      return;
    }
    await cartService.updateItem(req.user!.id, variantId, Number(quantity));
    res.status(200).json({ success: true, message: 'Cart quantities adjusted successfully.' });
  } catch (error) {
    res.status(errorStatus(error, 400)).json({ success: false, message: errorMessage(error) });
  }
};

const removeItem: RequestHandler = async (req, res) => {
  try {
    const variantId = Number(req.params.variantId);
    await cartService.removeItem(req.user!.id, variantId);
    res.status(200).json({ success: true, message: 'Item purged from cart.' });
  } catch (error) {
    res.status(errorStatus(error, 500)).json({ success: false, message: errorMessage(error) });
  }
};

export { getCart, addItem, updateItem, removeItem };
