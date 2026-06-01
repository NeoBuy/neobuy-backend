export interface AddToCartInput {
  variantId: number;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface CartItemResponse {
  id: number;
  variant_id: number;
  sku: string;
  product_title: string;
  variant_title: string | null;
  price_lkr: number;
  quantity: number;
  line_total_lkr: number;
  available_stock: number;
}

export type CartStatus = 'ACTIVE' | 'ORDERED' | 'ABANDONED';

export interface CartResponse {
  id: number;
  status: CartStatus;
  items: CartItemResponse[];
  subtotal_lkr: number;
}
