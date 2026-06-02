import cartRepository from '../repositories/cart.repository';
import orderRepository from '../repositories/order.repository';
import type { OrderResponse } from '../types/order';
import { createHttpError } from '../utils/http-error';

async function checkout(
  userId: number,
  shippingAddress: string,
  contactPhone: string,
): Promise<OrderResponse> {
  const activeCart = await cartRepository.getDetailedCart(userId);

  if (!activeCart || activeCart.items.length === 0) {
    throw createHttpError(400, 'Cannot process checkout with an empty shopping cart container.');
  }

  const orderId = await orderRepository.createOrderWithLocking(
    userId,
    activeCart.id,
    activeCart.items,
    shippingAddress,
    contactPhone,
  );

  const orderDetails = await orderRepository.getOrderDetails(orderId, userId);
  if (!orderDetails) {
    throw createHttpError(500, 'Failed to extract generated order invoices.');
  }

  return orderDetails;
}

export default {
  checkout,
};
