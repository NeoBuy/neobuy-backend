# Pessimistic Locking (FOR UPDATE) in Checkout

This document explains the concurrency safety model used by order checkout.

## Why it exists

Without row locks, two concurrent checkouts can both read `stock=1`, both pass validation, and oversell inventory.  
Checkout uses `SELECT ... FOR UPDATE` inside a transaction to serialize access to the same inventory rows.

## Runtime sequence

```
Connection 1 (User A)                 Connection 2 (User B)
       |                                     |
       |-- START TRANSACTION                 |-- START TRANSACTION
       |                                     |
       |-- SELECT ... FOR UPDATE             |
       |   (row lock acquired)               |
       |                                     |-- SELECT ... FOR UPDATE
       |                                     |   (blocked by MySQL lock queue)
       |-- stock = 1                         |
       |-- deduct stock (1 -> 0)             |
       |-- insert order rows                 |
       |-- COMMIT                            |
       |   (lock released)                   |
       |-- return 201                        |
                                             |-- lock acquired after wakeup
                                             |-- stock = 0
                                             |-- fails validation
                                             |-- ROLLBACK
                                             |-- return 400
```

## Implementation notes

- Uses one dedicated DB connection per checkout transaction.
- Locks all cart variant inventory rows in deterministic order.
- Validates stock **inside** lock boundary.
- Performs:
  - inventory update
  - `orders` insert
  - `order_items` insert
  - cart status transition (`ORDERED`)
- Commits only on full success; otherwise rollback.

## Guarantees

- No negative inventory from competing checkouts.
- No partial order write when a later item fails.
- Exactly one winner when two users compete for last unit.

## Validation via tests

- `tests/order.test.ts`: rollback and stock-deficit behavior
- `tests/concurrency.test.ts`: simultaneous checkout collision (`201` + `400`)
