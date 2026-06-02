# Public API Docs

This folder documents NeoBuy customer-facing APIs.

## Structure

- `product/`
  - GraphQL product discovery API
  - Next.js frontend integration notes
- `cart/`
  - REST cart endpoints (JWT protected)
- `wishlist/`
  - REST wishlist endpoints (JWT protected)
- `orders/`
  - REST order checkout endpoint (JWT protected)
  - Pessimistic locking + concurrency behavior

## Protocol split (Hybrid API)

- Product discovery: **GraphQL** (`POST /graphql`)
- Cart/Wishlist/Orders: **REST** (`/api/*`) with Bearer token
