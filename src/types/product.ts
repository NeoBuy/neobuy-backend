export type SortByOption = 'date_created' | 'price' | 'name' | 'most_sold';
export type SortOrderOption = 'ASC' | 'DESC';

export interface ProductDiscoveryQuery {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortByOption;
  sortOrder?: SortOrderOption;
  page?: number;
  limit?: number;
}

export interface CatalogProductVariant {
  id: number;
  sku: string;
  title: string | null;
  price_lkr: number;
  compare_at_price_lkr: number | null;
  quantity: number;
}

export interface CatalogProductItem {
  id: number;
  title: string;
  description: string;
  created_at: string;
  primary_image_url: string | null;
  min_price_lkr: number;
  total_sales: number;
  variants: CatalogProductVariant[];
}

export interface ProductDiscoveryResult {
  items: CatalogProductItem[];
  total: number;
}
