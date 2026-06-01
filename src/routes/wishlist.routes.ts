import { Router } from 'express';
import { getWishlist, toggleWishlistItem } from '../controllers/wishlist.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getWishlist);
router.post('/toggle', toggleWishlistItem);

export default router;
