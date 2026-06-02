import { Router } from 'express';
import { createOrder } from '../controllers/order.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticate, createOrder);

export default router;
