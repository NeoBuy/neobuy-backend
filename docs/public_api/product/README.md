# Product discovery (GraphQL)

Public catalog search and listing for the NeoBuy storefront. **Authentication is not required.**

REST product list/detail routes have been replaced by a single GraphQL query so clients (especially Next.js) can request only the fields they need per view.

| Layer | Path |
|-------|------|
| HTTP endpoint | `POST /graphql` |
| Query | `discoverProducts` |
| Auth (register/login) | REST — see [`../../auth.md`](../../auth.md) |

---

## Why GraphQL for discovery

- **Declarative fetching** — a search grid can request `title`, `primary_image_url`, and `min_price_lkr` only; a detail drawer can add `description` and `variants` in the same query shape without new backend routes.
- **Smaller payloads** — important for mobile shoppers on slower networks.
- **One resolver** — filters, sort, and pagination live behind `discoverProducts(filter: …)`.

---

## Endpoint

```
POST http://localhost:4000/graphql
Content-Type: application/json
```

Example body:

```json
{
  "query": "query { discoverProducts { meta { total_items } data { id title } } }"
}
```

During local development you can also open Apollo Sandbox at the same URL (browser GET) when enabled by your Apollo Server version.

---

## Query: `discoverProducts`

### Arguments

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `filter` | `ProductDiscoveryInput` | No | see below | Search, price band, sort, pagination |

### `ProductDiscoveryInput`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | `String` | — | Case-insensitive match on product `title` or `description` |
| `minPrice` | `Int` | — | Minimum **lowest variant price** (LKR, whole units) |
| `maxPrice` | `Int` | — | Maximum **lowest variant price** (LKR) |
| `sortBy` | `SortByOption` | `date_created` | `date_created` \| `price` \| `name` \| `most_sold` |
| `sortOrder` | `SortOrderOption` | `DESC` | `ASC` \| `DESC` |
| `page` | `Int` | `1` | 1-based page index |
| `limit` | `Int` | `20` | Page size (capped at **100** server-side) |

Only **ACTIVE** products are returned. Variants included per product are **ACTIVE** with `inventory.quantity` (0 if no row).

| `sortBy` | Orders by |
|----------|-----------|
| `date_created` | Product `created_at` |
| `price` | Lowest active variant price |
| `name` | Product title |
| `most_sold` | Sum of `order_items.quantity` across all variants |

---

## Response shape: `PaginatedDiscoveryResponse`

```json
{
  "data": {
    "discoverProducts": {
      "success": true,
      "meta": {
        "total_items": 42,
        "current_page": 1,
        "per_page": 20,
        "total_pages": 3
      },
      "data": [
        {
          "id": "1",
          "title": "Cotton Shirt",
          "description": "Lightweight shirt for warm weather.",
          "created_at": "2025-06-01T10:00:00.000Z",
          "primary_image_url": "https://cdn.example/shirt.jpg",
          "min_price_lkr": 3500,
          "total_sales": 12,
          "variants": [
            {
              "id": "10",
              "sku": "SHIRT-M-BLK",
              "title": "Medium / Black",
              "price_lkr": 3500,
              "compare_at_price_lkr": 4200,
              "quantity": 8
            }
          ]
        }
      ]
    }
  }
}
```

### Fields

**`meta`**

| Field | Type | Description |
|-------|------|-------------|
| `total_items` | `Int!` | Matching products across all pages |
| `current_page` | `Int!` | Current page (from `filter.page`) |
| `per_page` | `Int!` | Page size used |
| `total_pages` | `Int!` | `ceil(total_items / per_page)` |

**`data[]` — `CatalogProductItem`**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | Product ID |
| `title` | `String!` | Product title |
| `description` | `String!` | Full description (omit in grid queries) |
| `created_at` | `String!` | ISO 8601 timestamp |
| `primary_image_url` | `String` | First `product_images` row by `sort_order` |
| `min_price_lkr` | `Int!` | Minimum price among active variants |
| `total_sales` | `Int!` | Lifetime units sold (all order line items) |
| `variants` | `[CatalogProductVariant!]!` | Active SKUs (omit in compact grid queries) |

**`variants[]` — `CatalogProductVariant`**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | Variant ID |
| `sku` | `String!` | Unique SKU |
| `title` | `String` | Display label |
| `price_lkr` | `Int!` | Price in whole LKR |
| `compare_at_price_lkr` | `Int` | Strike-through price if set |
| `quantity` | `Int!` | Stock on hand |

GraphQL may return numeric IDs as strings in JSON (`"1"`). Treat them as opaque IDs on the client.

---

## Example queries

### Compact search grid

```graphql
query SearchGrid($filter: ProductDiscoveryInput) {
  discoverProducts(filter: $filter) {
    success
    meta {
      total_items
      current_page
      total_pages
    }
    data {
      id
      title
      primary_image_url
      min_price_lkr
    }
  }
}
```

Variables:

```json
{
  "filter": {
    "search": "shirt",
    "sortBy": "price",
    "sortOrder": "ASC",
    "page": 1,
    "limit": 24
  }
}
```

### Detail drawer (variants + description)

```graphql
query ProductDetails($filter: ProductDiscoveryInput) {
  discoverProducts(filter: $filter) {
    data {
      id
      title
      description
      primary_image_url
      min_price_lkr
      total_sales
      variants {
        id
        sku
        title
        price_lkr
        compare_at_price_lkr
        quantity
      }
    }
  }
}
```

Use `filter.search` or load by narrowing search; a dedicated `productById` query can be added later if you need direct ID lookup without search.

---

## Architecture (backend)

```
src/graphql/schema.ts      # typeDefs
src/graphql/resolvers.ts   # Query.discoverProducts
src/repositories/product.repository.ts  # discoverProducts SQL
src/types/product.ts       # TypeScript types
```

REST remains for **auth** (`/api/auth/*`) and **health** (`/api/health`).

---

## Frontend guide

See [`fe_instructions.md`](./fe_instructions.md) for Next.js setup with Apollo Client or `fetch`, typed operations, and layout-specific queries.
