# Database Design

This document defines the e-commerce database for phase 1:

- Roles: customer and admin (seller-ready for future)
- Product catalog with variants (size, color, etc.)
- Cart and wishlist
- Multi-item orders
- Stripe and cash on delivery payments
- Manual shipping/courier tracking updates
- Currency: LKR

The schema is designed to support future expansion to:

- Multiple sellers and seller onboarding
- Promotions and bundle deals

---

## 1. Core Entity Groups

### Identity and Access

- `users`
- `roles`
- `user_roles`
- `addresses`

### Merchant and Catalog

- `merchants`
- `products`
- `product_images`
- `product_options`
- `product_option_values`
- `product_variants`
- `product_variant_values`
- `product_variant_images`
- `inventory`

### Shopping Experience

- `carts`
- `cart_items`
- `wishlists`
- `wishlist_items`

### Checkout and Fulfillment

- `orders`
- `order_items`
- `payments`
- `shipments`
- `shipment_events`

---

## 2. Tables and Attributes

### `merchants`

Purpose: Product ownership boundary. Phase 1 uses one internal merchant, but this enables multiple sellers later.

Columns:

- `id` (PK)
- `type` (`INTERNAL` | `SELLER`)
- `name`
- `status` (`ACTIVE` | `INACTIVE` | `PENDING`)
- `created_at`
- `updated_at`

---

### `users`

Purpose: User identity for customers/admins now; seller users later.

Columns:

- `id` (PK)
- `merchant_id` (FK -> `merchants.id`, nullable for non-seller users)
- `email` (unique, nullable if phone-based account)
- `phone` (unique, nullable if email-based account)
- `password_hash`
- `status` (`ACTIVE` | `BLOCKED` | `PENDING`)
- `created_at`
- `updated_at`

---

### `roles`

Purpose: Role definitions.

Columns:

- `id` (PK)
- `code` (unique; values such as `CUSTOMER`, `ADMIN`, future `SELLER`)

---

### `user_roles`

Purpose: Many-to-many mapping between users and roles.

Columns:

- `user_id` (PK, FK -> `users.id`)
- `role_id` (PK, FK -> `roles.id`)

---

### `addresses`

Purpose: User shipping/contact addresses.

Columns:

- `id` (PK)
- `user_id` (FK -> `users.id`)
- `label` (Home, Office, etc.)
- `recipient_name`
- `phone`
- `line1`
- `line2`
- `city`
- `province` (e.g., Western, Central — supports courier zone routing with `district`)
- `district` (e.g., Colombo, Gampaha — primary local delivery granularity)
- `postal_code`
- `country_code` (default `LK`)
- `is_default_shipping`
- `created_at`
- `updated_at`

Constraint recommendation:

- Phase 1: store `province` and `district` as validated strings in application code.
- Phase 2 (courier automation): replace free-text with lookup tables `provinces` and `districts` (district FK -> province) and optional `shipping_zones` keyed by province/district. Avoid hard-coding all districts as a DB `ENUM` — Sri Lanka has 9 provinces and 25 districts; lookup tables are easier to maintain than enum migrations.

---

### `products`

Purpose: Product-level container (marketing-level item).

Columns:

- `id` (PK)
- `merchant_id` (FK -> `merchants.id`)
- `title`
- `description`
- `status` (`DRAFT` | `ACTIVE` | `ARCHIVED`)
- `created_at`
- `updated_at`

---

### `product_images`

Purpose: Generic images for the product-level gallery.

Columns:

- `id` (PK)
- `product_id` (FK -> `products.id`)
- `url`
- `sort_order`
- `created_at`

---

### `product_options`

Purpose: Defines choice dimensions for a product (e.g., Size, Color).

Columns:

- `id` (PK)
- `product_id` (FK -> `products.id`)
- `name`
- `created_at`

Constraint recommendation:

- Unique on (`product_id`, `name`)

---

### `product_option_values`

Purpose: Allowed values under each option (e.g., S/M/L for Size).

Columns:

- `id` (PK)
- `option_id` (FK -> `product_options.id`)
- `value`
- `created_at`

Constraint recommendation:

- Unique on (`option_id`, `value`)

---

### `product_variants`

Purpose: Actual sellable unit (SKU, price, shipping attributes).

Columns:

- `id` (PK)
- `product_id` (FK -> `products.id`)
- `sku` (unique)
- `title` (optional readable label)
- `price_lkr`
- `compare_at_price_lkr` (nullable)
- `weight_grams`
- `length_cm`
- `width_cm`
- `height_cm`
- `status` (`ACTIVE` | `INACTIVE`)
- `created_at`
- `updated_at`

---

### `product_variant_values`

Purpose: Bridge table assigning option/value pairs to each variant.

Columns:

- `variant_id` (PK, FK -> `product_variants.id`)
- `option_id` (PK, FK -> `product_options.id`)
- `option_value_id` (PK, FK -> `product_option_values.id`)

Primary key: composite (`variant_id`, `option_id`, `option_value_id`).

Example:

- Variant 101 -> Size = M
- Variant 101 -> Color = Black

Constraint recommendation:

- Composite primary key on all three columns — each row is uniquely identified by variant + option + chosen value.
- Enforce that `option_value_id` belongs to `option_id` (application validation or DB trigger). A variant must not map the same option twice with different values.
- One row per option per variant is still the rule; the three-column PK makes the mapping explicit and avoids ambiguous rows if integrity checks are added later.

---

### `product_variant_images`

Purpose: Variant-specific images (for color/style-specific display).

Columns:

- `id` (PK)
- `variant_id` (FK -> `product_variants.id`)
- `url`
- `sort_order`
- `is_primary`
- `created_at`

---

### `inventory`

Purpose: Per-variant stock tracking.

Columns:

- `variant_id` (PK, FK -> `product_variants.id`)
- `quantity`
- `updated_at`

---

### `carts`

Purpose: User cart header (active/ordered/abandoned).

Columns:

- `id` (PK)
- `user_id` (FK -> `users.id`)
- `status` (`ACTIVE` | `ORDERED` | `ABANDONED`)
- `created_at`
- `updated_at`

---

### `cart_items`

Purpose: Items added to cart.

Columns:

- `id` (PK)
- `cart_id` (FK -> `carts.id`)
- `variant_id` (FK -> `product_variants.id`)
- `quantity`
- `created_at`
- `updated_at`

Constraint recommendation:

- Unique on (`cart_id`, `variant_id`)

---

### `wishlists`

Purpose: Wishlist header (one per user).

Columns:

- `id` (PK)
- `user_id` (FK -> `users.id`, unique)
- `created_at`

---

### `wishlist_items`

Purpose: Variants saved to wishlist.

Columns:

- `id` (PK)
- `wishlist_id` (FK -> `wishlists.id`)
- `variant_id` (FK -> `product_variants.id`)
- `created_at`

Constraint recommendation:

- Unique on (`wishlist_id`, `variant_id`)

---

### `orders`

Purpose: Order header and totals.

Columns:

- `id` (PK)
- `order_number` (unique)
- `user_id` (FK -> `users.id`)
- `currency` (`LKR`)
- `status` (`PENDING_PAYMENT` | `PLACED` | `CONFIRMED` | `PACKED` | `SHIPPED` | `DELIVERED` | `CANCELLED` | `REFUNDED`)
- `payment_status` (`UNPAID` | `PARTIALLY_PAID` | `PAID` | `REFUNDED`)
- `fulfillment_status` (`UNFULFILLED` | `PARTIALLY_FULFILLED` | `FULFILLED`)
- `subtotal_lkr`
- `discount_lkr`
- `shipping_lkr`
- `total_lkr`
- `shipping_address_id` (FK -> `addresses.id`)
- `placed_at`
- `created_at`
- `updated_at`

---

### `order_items`

Purpose: Line items in an order (snapshot data preserved).

Columns:

- `id` (PK)
- `order_id` (FK -> `orders.id`)
- `variant_id` (FK -> `product_variants.id`)
- `product_title` (snapshot)
- `variant_title` (snapshot)
- `sku` (snapshot)
- `unit_price_lkr`
- `quantity`
- `line_total_lkr`
- `created_at`

---

### `payments`

Purpose: Payment attempts/records, supporting Stripe and COD.

Columns:

- `id` (PK)
- `order_id` (FK -> `orders.id`)
- `method` (`STRIPE` | `COD`)
- `status` (`PENDING` | `AUTHORIZED` | `SUCCEEDED` | `FAILED` | `CANCELLED` | `REFUNDED`)
- `amount_lkr`
- `stripe_payment_intent_id` (nullable)
- `stripe_charge_id` (nullable)
- `raw_provider_payload` (JSON, nullable)
- `created_at`
- `updated_at`

---

### `shipments`

Purpose: Shipment record per order with manual courier updates.

Columns:

- `id` (PK)
- `order_id` (FK -> `orders.id`)
- `courier_name`
- `tracking_number`
- `status` (`READY` | `PICKED_UP` | `IN_TRANSIT` | `OUT_FOR_DELIVERY` | `DELIVERED` | `RETURNED` | `CANCELLED`)
- `created_at`
- `updated_at`

---

### `shipment_events`

Purpose: History log of shipment status changes.

Columns:

- `id` (PK)
- `shipment_id` (FK -> `shipments.id`)
- `status`
- `note`
- `created_by_user_id` (FK -> `users.id`, admin actor)
- `event_time`

---

## 3. Relationship Summary

- One merchant -> many products
- One product -> many variants
- One variant -> one inventory row
- One product -> many options; one option -> many option values
- One variant -> many option/value mappings (`product_variant_values`)
- One user -> many addresses, carts, orders
- One user -> one wishlist
- One order -> many order items, payments, shipments
- One shipment -> many shipment events

---

## 4. Money and Currency Rules

- All money fields use integer `*_lkr` columns.
- Values represent whole LKR units consistently.
- Never use floating point for monetary math.

---

## 5. Indexing and Constraints (Minimum Recommended)

- Unique:
  - `users.email`, `users.phone`
  - `roles.code`
  - `product_variants.sku`
  - `orders.order_number`
  - `wishlists.user_id`
  - (`cart_id`, `variant_id`) on `cart_items`
  - (`wishlist_id`, `variant_id`) on `wishlist_items`
  - (`product_id`, `name`) on `product_options`
  - (`option_id`, `value`) on `product_option_values`

- Composite primary key:
  - (`variant_id`, `option_id`, `option_value_id`) on `product_variant_values`

- Foreign key indexes on all FK columns.

---

## 6. Future Extension Plan

### Sellers and Onboarding

Already prepared through:

- `merchants` table
- `users.merchant_id`
- `products.merchant_id`

Future additions can include:

- `merchant_profiles`
- `merchant_kyc_documents`
- `merchant_bank_accounts`
- `merchant_onboarding_steps`

### Bundle Deals and Promotions

Not required in phase 1, but compatible by adding:

- `promotions`
- `promotion_rules`
- `promotion_applications`
- optional `bundle_definitions`

Order snapshots in `order_items` protect historical accuracy even if pricing logic changes.

### Shipping zones and courier routing (Sri Lanka)

Phase 1 uses `province` + `district` on `addresses` for display and manual shipping decisions.

Future additions for automated courier cost routing:

- `provinces` (id, name, code)
- `districts` (id, province_id, name)
- `shipping_zones` or `courier_rate_rules` (zone keyed by province/district, weight brackets, flat or tiered `shipping_lkr`)

Prefer lookup tables over `ENUM` for province/district so rates and UI dropdowns stay maintainable.

---

## 7. Design Logic (Why This Structure)

1. **Variant-first commerce model**  
   Stock, pricing, shipping attributes, SKU, and images live at variant level because those properties often differ by size/color/material combinations.

2. **Clear separation of concerns**  
   Product tables represent catalog modeling, cart/wishlist tables represent shopping intent, and order/payment/shipment tables represent transaction history and fulfillment.

3. **Future seller support without refactor**  
   Merchant ownership is included from day one even with a single internal merchant. This prevents a disruptive schema migration when marketplace features are introduced.

4. **Historical order safety**  
   `order_items` keeps snapshot fields (title, SKU, unit price) so that later catalog edits do not change past order records.

5. **Flexible and scalable option modeling**  
   The `product_options` -> `product_option_values` -> `product_variant_values` pattern supports any number of option dimensions, not just fixed columns like size/color.

6. **Operational practicality for local market**  
   The model supports both online and COD payments and manual courier status updates, which fits real-world logistics flows.

7. **Financial correctness**  
   Integer money fields avoid floating-point errors and align with reliable accounting and payment reconciliation.

8. **Explicit variant–option mapping**  
   The three-column primary key on `product_variant_values` (`variant_id`, `option_id`, `option_value_id`) fully identifies each variant’s chosen option value and keeps the bridge table unambiguous as catalog rules grow.

9. **Sri Lanka–friendly addresses**  
   `province` plus `district` matches how couriers and local delivery are usually priced and operated. Free-text in phase 1 keeps onboarding simple; province/district lookup tables later enable automated shipping quotes without redesigning `addresses`.
