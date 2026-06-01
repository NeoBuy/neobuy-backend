export interface WishlistItemResponse {
  id: number;
  product_id: number;
  variant_id: number;
  product_title: string;
  variant_title: string | null;
  price_lkr: number;
  sku: string;
  primary_image_url: string | null;
}

export type WishlistToggleAction = 'ADDED' | 'REMOVED';

export interface WishlistToggleResult {
  action: WishlistToggleAction;
}
