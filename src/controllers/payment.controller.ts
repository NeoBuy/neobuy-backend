import type { RequestHandler } from 'express';
import StripeClient from 'stripe';
import stripeService from '../services/stripe.service';
import type { CreateCheckoutSessionInput, CreateCheckoutSessionResponse } from '../types/payment';
import { isHttpError } from '../utils/http-error';

function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return key;
}

function getStripeClient() {
  return new StripeClient(getStripeSecretKey(), {
    apiVersion: '2026-05-27.dahlia',
  });
}

const createCheckoutSession: RequestHandler = async (req, res) => {
  try {
    const { orderId } = req.body as CreateCheckoutSessionInput;
    if (!orderId || !Number.isInteger(Number(orderId))) {
      res.status(400).json({ success: false, message: 'orderId is required.' });
      return;
    }

    const url = await stripeService.createCheckoutSession(Number(orderId), req.user!.id);
    const body: CreateCheckoutSessionResponse = { url };
    res.status(200).json({ success: true, data: body });
  } catch (error) {
    const status = isHttpError(error) && error.status ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Failed to create checkout session.';
    res.status(status).json({ success: false, message });
  }
};

const handleStripeWebhook: RequestHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || !req.rawBody) {
    res.status(400).json({ success: false, message: 'Missing signature or payload metrics' });
    return;
  }

  let event: any;
  try {
    event = getStripeClient().webhooks.constructEvent(req.rawBody, sig, getStripeWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown signature error';
    res.status(400).send(`Webhook Error Signature verification failed: ${message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata?: { orderId?: string };
          payment_intent?: string;
        };
        const orderId = Number(session.metadata?.orderId);
        const paymentIntentId = session.payment_intent || '';
        if (orderId) {
          await stripeService.fulfillOrder(orderId, paymentIntentId);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as { metadata?: { orderId?: string } };
        const orderId = Number(session.metadata?.orderId);
        if (orderId) {
          await stripeService.voidOrder(orderId);
        }
        break;
      }
      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    const status = isHttpError(error) && error.status ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    res.status(status).json({ success: false, message });
  }
};

export { createCheckoutSession, handleStripeWebhook };
