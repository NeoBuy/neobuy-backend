# Price Drift Protection During Checkout

This document explains how NeoBuy prevents stale-cart pricing abuse during order placement.

## Problem

If checkout trusts prices from cart snapshots, users can pay outdated amounts after an admin changes catalog prices.

Example:

1. User adds variant to cart at `1000 LKR`
2. Admin updates variant price to `4500 LKR`
3. User checks out later
4. Vulnerable implementation would still charge `1000 LKR`

This is a financial integrity risk.

---

## Security Strategy

Checkout now resolves prices from the **live catalog inside the pessimistic lock transaction**.

### Key controls

- Checkout locks targeted inventory rows with `FOR UPDATE`
- The same lock-scoped query reads:
  - `variant_id`
  - `price_lkr` (authoritative live price)
  - `sku`
  - `quantity` (stock)
- Stock validation and total calculation happen **inside the lock boundary**
- Order totals and line-item prices are written using resolved live values only
- Cart snapshot pricing is ignored for billing

---

## Repository behavior

In `src/repositories/order.repository.ts` (`createOrderWithLocking`):

1. Sort `variantIds` deterministically (deadlock reduction)
2. Lock and fetch live metrics:
   - `product_variants` + `inventory` (+ active product check)
   - `FOR UPDATE`
3. Validate stock using locked rows
4. Resolve `resolved price` and `line total` per item
5. Compute `subtotal_lkr` / `total_lkr` from resolved values
6. Write:
   - `orders`
   - `order_items.unit_price_lkr`
   - `order_items.line_total_lkr`
7. Deduct inventory and transition cart to `ORDERED`
8. Commit on success, rollback on any failure

---

## Price History Ledger

To audit price changes, a dedicated history table was added.

### Migration

- `migrations/20260602153000-add-product-price-history.js`

### Table

- `product_price_history`
  - `variant_id`
  - `old_price_lkr`
  - `new_price_lkr`
  - `changed_at`

---

## Admin-side price update tracking

`src/repositories/inventory.repository.ts` adds:

- `changeVariantPrice(variantId, newPrice)`

Behavior:

- row lock with `SELECT ... FOR UPDATE`
- no-op if price unchanged
- update `product_variants.price_lkr`
- insert audit row in `product_price_history`
- transactional commit/rollback

---

## Verification Test

Added integration test in `tests/order.test.ts`:

- `uses live locked variant pricing during checkout (price drift safe)`

Validation flow:

1. Set DB price to `1000`
2. Add item to cart
3. Change DB price to `4500`
4. Checkout
5. Assert order totals are `9000` (`4500 * 2`), not stale value

---

## Outcome

NeoBuy checkout now enforces:

- **live-price billing**
- **stock-safe locking**
- **auditability of price mutations**

This closes the price-drift vulnerability without sacrificing transactional correctness.
