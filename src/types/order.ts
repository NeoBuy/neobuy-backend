export interface PlaceOrderInput {
  shippingAddress: string;
  contactPhone: string;
}

export interface OrderItemResponse {
  variantId: number;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  priceLkr: number;
  lineTotalLkr: number;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface OrderResponse {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  totalAmountLkr: number;
  shippingAddress: string;
  contactPhone: string;
  items: OrderItemResponse[];
  createdAt: Date;
}
