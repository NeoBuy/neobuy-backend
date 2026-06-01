import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { authenticateUser } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:variantId', cartController.updateItem);
router.delete('/items/:variantId', cartController.removeItem);

export default router;
