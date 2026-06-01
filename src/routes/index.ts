import { Router } from 'express';
import authRoutes from './auth.routes';
import cartRoutes from './cart.routes';
import wishlistRoutes from './wishlist.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);

export default router;
