# Orders API (REST Checkout)

Base path: `/api/orders`  
Auth: `Authorization: Bearer <token>` required.

## `POST /api/orders`

Creates an order from the authenticated user's active cart.

Body:

```json
{
  "shippingAddress": "45 Flower Rd, Colombo",
  "contactPhone": "0771234567"
}
```

Success (`201`):

```json
{
  "success": true,
  "data": {
    "orderId": 123,
    "orderNumber": "NB-1717312345678-4821",
    "status": "PENDING_PAYMENT",
    "totalAmountLkr": 7000,
    "shippingAddress": "45 Flower Rd, Colombo",
    "contactPhone": "0771234567",
    "items": [
      {
        "variantId": 10,
        "sku": "SHIRT-M-BLK",
        "productTitle": "Cotton Shirt",
        "variantTitle": "M / Black",
        "quantity": 2,
        "priceLkr": 3500,
        "lineTotalLkr": 7000
      }
    ],
    "createdAt": "2026-06-02T07:20:00.000Z"
  }
}
```

## Business rules

- Active cart must exist and contain at least one item.
- Inventory rows are pessimistically locked with `FOR UPDATE`.
- Inventory is decremented only after lock-safe validation.
- Cart is transitioned to `ORDERED` on success.
- Any failure triggers full rollback.

## Errors

- `400` empty cart, stock deficit, invalid body
- `401` unauthorized
- `500` unexpected server failure

See locking flow details in [`pessimistic_locking.md`](./pessimistic_locking.md).
