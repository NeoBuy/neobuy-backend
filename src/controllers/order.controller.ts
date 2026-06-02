import type { RequestHandler } from 'express';
import orderService from '../services/order.service';
import type { PlaceOrderInput } from '../types/order';
import { isHttpError } from '../utils/http-error';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

function errorStatus(error: unknown, fallback: number): number {
  return isHttpError(error) && error.status ? error.status : fallback;
}

const createOrder: RequestHandler = async (req, res) => {
  try {
    const { shippingAddress, contactPhone } = req.body as PlaceOrderInput;

    if (!shippingAddress || !contactPhone) {
      res.status(400).json({
        success: false,
        message: 'shippingAddress and contactPhone parameter inputs are strictly mandatory.',
      });
      return;
    }

    const order = await orderService.checkout(req.user!.id, shippingAddress, contactPhone);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    const structured = error as {
      code?: string;
      variantId?: number;
      sku?: string;
      productTitle?: string;
      variantTitle?: string | null;
      availableStock?: number;
      requestedQuantity?: number;
    };

    if (structured.code === 'INSUFFICIENT_STOCK') {
      res.status(400).json({
        success: false,
        code: 'STOCK_OUTAGE',
        message: errorMessage(error),
        errorDetails: {
          variantId: structured.variantId,
          sku: structured.sku,
          productTitle: structured.productTitle,
          variantTitle: structured.variantTitle ?? null,
          availableStock: structured.availableStock,
          requestedQuantity: structured.requestedQuantity,
        },
      });
      return;
    }

    res.status(errorStatus(error, 400)).json({ success: false, message: errorMessage(error) });
  }
};

export { createOrder };
