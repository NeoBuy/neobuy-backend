# Cart API (REST)

Base path: `/api/cart`  
Auth: `Authorization: Bearer <token>` required on all endpoints.

## Endpoints

### `GET /api/cart`
Returns the active cart for the authenticated user.

Response:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "ACTIVE",
    "items": [],
    "subtotal_lkr": 0
  }
}
```

### `POST /api/cart/items`
Add an item to cart. If same variant already exists, quantity increments.

Body:

```json
{
  "variantId": 10,
  "quantity": 2
}
```

Success:

```json
{
  "success": true,
  "message": "Item appended to cart successfully."
}
```

### `PUT /api/cart/items/:variantId`
Set quantity for a cart line. If quantity is `<= 0`, line is removed.

Body:

```json
{
  "quantity": 4
}
```

### `DELETE /api/cart/items/:variantId`
Remove a variant from the cart.

## Validation and stock rules

- Variant must be active and belong to an active product.
- Quantity must be positive for add.
- Add checks **existing quantity + new quantity** against current stock.
- Update checks target quantity against current stock.

## Errors

- `401` unauthorized token/missing token
- `400` invalid input / quantity / stock constraints
- `404` variant not available
