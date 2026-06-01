import type { ExecuteValues, RowDataPacket } from 'mysql2';
import { query } from '../config/db';
import type {
  CatalogProductItem,
  CatalogProductVariant,
  ProductDiscoveryQuery,
  ProductDiscoveryResult,
  SortByOption,
  SortOrderOption,
} from '../types/product';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SORT_COLUMNS: Record<SortByOption, string> = {
  date_created: 'p.created_at',
  price: 'min_price_lkr',
  name: 'p.title',
  most_sold: 'total_sales',
};

interface DiscoveryProductRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  created_at: Date;
  primary_image_url: string | null;
  min_price_lkr: number | null;
  total_sales: number;
}

interface VariantRow extends RowDataPacket {
  id: number;
  product_id: number;
  sku: string;
  title: string | null;
  price_lkr: number;
  compare_at_price_lkr: number | null;
  quantity: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function normalizeQuery(input: ProductDiscoveryQuery): Required<
  Pick<ProductDiscoveryQuery, 'sortBy' | 'sortOrder' | 'page' | 'limit'>
> &
  ProductDiscoveryQuery {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const page = Math.max(1, input.page ?? 1);
  const sortBy = input.sortBy ?? 'date_created';
  const sortOrder = input.sortOrder ?? 'DESC';

  if (!SORT_COLUMNS[sortBy]) {
    throw new Error(`Invalid sortBy value: ${sortBy}`);
  }
  if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
    throw new Error(`Invalid sortOrder value: ${sortOrder}`);
  }

  return { ...input, sortBy, sortOrder, page, limit };
}

function buildFilterClause(filters: ProductDiscoveryQuery): { clause: string; params: ExecuteValues[] } {
  const clauses = ["p.status = 'ACTIVE'"];
  const params: ExecuteValues[] = [];

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(p.title LIKE ? OR p.description LIKE ?)');
    params.push(term, term);
  }

  if (filters.minPrice != null) {
    clauses.push(
      `(SELECT MIN(pv.price_lkr) FROM product_variants pv WHERE pv.product_id = p.id AND pv.status = 'ACTIVE') >= ?`,
    );
    params.push(filters.minPrice);
  }

  if (filters.maxPrice != null) {
    clauses.push(
      `(SELECT MIN(pv.price_lkr) FROM product_variants pv WHERE pv.product_id = p.id AND pv.status = 'ACTIVE') <= ?`,
    );
    params.push(filters.maxPrice);
  }

  return { clause: clauses.join(' AND '), params };
}

const MIN_PRICE_SQL = `(SELECT MIN(pv.price_lkr) FROM product_variants pv WHERE pv.product_id = p.id AND pv.status = 'ACTIVE')`;
const TOTAL_SALES_SQL = `(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi INNER JOIN product_variants pv ON pv.id = oi.variant_id WHERE pv.product_id = p.id)`;
const PRIMARY_IMAGE_SQL = `(SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1)`;

async function discoverProducts(input: ProductDiscoveryQuery): Promise<ProductDiscoveryResult> {
  const filters = normalizeQuery(input);
  const { clause, params } = buildFilterClause(filters);
  const sortColumn = SORT_COLUMNS[filters.sortBy!];
  const sortOrder = filters.sortOrder as SortOrderOption;
  const offset = (filters.page! - 1) * filters.limit!;

  const countRows = await query<CountRow>(
    `SELECT COUNT(*) AS total FROM products p WHERE ${clause}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  if (total === 0) {
    return { items: [], total: 0 };
  }

  const productRows = await query<DiscoveryProductRow>(
    `SELECT
       p.id,
       p.title,
       p.description,
       p.created_at,
       ${PRIMARY_IMAGE_SQL} AS primary_image_url,
       ${MIN_PRICE_SQL} AS min_price_lkr,
       ${TOTAL_SALES_SQL} AS total_sales
     FROM products p
     WHERE ${clause}
     ORDER BY ${sortColumn} ${sortOrder}, p.id ASC
     LIMIT ? OFFSET ?`,
    [...params, filters.limit, offset],
  );

  if (productRows.length === 0) {
    return { items: [], total };
  }

  const productIds = productRows.map((row) => row.id);
  const placeholders = productIds.map(() => '?').join(', ');
  const variantRows = await query<VariantRow>(
    `SELECT
       pv.id,
       pv.product_id,
       pv.sku,
       pv.title,
       pv.price_lkr,
       pv.compare_at_price_lkr,
       COALESCE(i.quantity, 0) AS quantity
     FROM product_variants pv
     LEFT JOIN inventory i ON i.variant_id = pv.id
     WHERE pv.product_id IN (${placeholders}) AND pv.status = 'ACTIVE'
     ORDER BY pv.product_id ASC, pv.id ASC`,
    productIds,
  );

  const variantsByProduct = new Map<number, CatalogProductVariant[]>();
  for (const row of variantRows) {
    const list = variantsByProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      title: row.title,
      price_lkr: row.price_lkr,
      compare_at_price_lkr: row.compare_at_price_lkr,
      quantity: row.quantity,
    });
    variantsByProduct.set(row.product_id, list);
  }

  const items: CatalogProductItem[] = productRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    created_at: row.created_at.toISOString(),
    primary_image_url: row.primary_image_url,
    min_price_lkr: row.min_price_lkr ?? 0,
    total_sales: Number(row.total_sales),
    variants: variantsByProduct.get(row.id) ?? [],
  }));

  return { items, total };
}

export default {
  discoverProducts,
};
