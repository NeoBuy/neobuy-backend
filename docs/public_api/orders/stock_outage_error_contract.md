# Structured Stock Outage Error Contract

This document defines the checkout error payload returned when one or more cart variants fail stock validation inside the lock-protected checkout transaction.

## Why this exists

A generic `400` message is not enough for multi-item carts.  
Frontend clients need exact item metadata to highlight the failing line item and avoid blind retry loops.

---

## Trigger condition

During `POST /api/orders`, inside `createOrderWithLocking`:

- inventory + variant rows are read in a `FOR UPDATE` lock boundary
- if `available stock < requested quantity` for any item, checkout aborts

The transaction is rolled back and no partial write is committed.

---

## HTTP response

Status: `400 Bad Request`

```json
{
  "success": false,
  "code": "STOCK_OUTAGE",
  "message": "Stock deficit for SKU: SHIRT-M-BLK. Requested: 5, Available: 1",
  "errorDetails": {
    "variantId": 10,
    "sku": "SHIRT-M-BLK",
    "productTitle": "Cotton Shirt",
    "variantTitle": "M / Black",
    "availableStock": 1,
    "requestedQuantity": 5
  }
}
```

---

## Field definitions

| Field | Type | Meaning |
|------|------|---------|
| `code` | `string` | Fixed machine code: `STOCK_OUTAGE` |
| `message` | `string` | Human-readable summary |
| `errorDetails.variantId` | `number` | Variant that failed validation |
| `errorDetails.sku` | `string` | SKU for display/logging |
| `errorDetails.productTitle` | `string` | Product title snapshot |
| `errorDetails.variantTitle` | `string \\| null` | Variant label (if available) |
| `errorDetails.availableStock` | `number` | Live locked stock at failure time |
| `errorDetails.requestedQuantity` | `number` | Quantity requested by checkout |

---

## Frontend handling recommendation

When `code === "STOCK_OUTAGE"`:

1. Locate cart line by `variantId`
2. Show inline warning (e.g. `Only {availableStock} left`)
3. Auto-adjust quantity or prompt user action
4. Re-fetch cart summary before retry

This gives deterministic UX and reduces repeated lock contention retries.

---

## Backend consistency guarantees

- Validation happens under pessimistic locking (`FOR UPDATE`)
- On failure: transaction rollback (no inventory/order side effects)
- Response contains deterministic machine-readable metadata for a single failing variant
