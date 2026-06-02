import { Router } from 'express';
import { createCheckoutSession, handleStripeWebhook } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/checkout-session', authenticate, createCheckoutSession);
router.post('/webhook', handleStripeWebhook);

export default router;
