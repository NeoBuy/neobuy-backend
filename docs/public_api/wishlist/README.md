# Wishlist API (REST)

Base path: `/api/wishlist`  
Auth: `Authorization: Bearer <token>` required on all endpoints.

## Endpoints

### `GET /api/wishlist`
List active wishlist items for current user.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "product_id": 5,
      "variant_id": 10,
      "product_title": "Cotton Shirt",
      "variant_title": "M / Black",
      "price_lkr": 3500,
      "sku": "SHIRT-M-BLK",
      "primary_image_url": "https://cdn.example.com/p.jpg"
    }
  ]
}
```

### `POST /api/wishlist/toggle`
Single toggle endpoint:
- Adds item if not present
- Removes item if present

Body:

```json
{
  "variantId": 10
}
```

Success response:

```json
{
  "success": true,
  "action": "ADDED",
  "message": "Item successfully appended to wishlist."
}
```

or

```json
{
  "success": true,
  "action": "REMOVED",
  "message": "Item purged from wishlist."
}
```

## Validation rules

- Variant must be active and under an active product.
- Uses user-level wishlist container (`wishlists`) plus item rows (`wishlist_items`).

## Errors

- `401` unauthorized token/missing token
- `400` invalid `variantId`
- `404` variant unavailable
