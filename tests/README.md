# Integration tests

## Auto-rollback isolation

Each test runs inside a MySQL transaction that is **never committed**:

```typescript
beforeEach(async () => {
  await beginTestTransaction();
});

afterEach(async () => {
  await rollbackTestTransaction();
});
```

While the transaction is open, `src/config/db.ts` routes every `query()`, `execute()`, and `acquireConnection()` call through that single connection. Supertest hits real controllers and repositories, but all writes are rolled back in `afterEach`.

### Benefits

- No manual `DELETE` cleanup sequences
- Crashed tests do not leave orphaned users, carts, or wishlists
- Suites can run in parallel later (one connection per worker)

### Baseline catalog

`ensureTestCatalog()` runs in `beforeAll` **outside** the per-test transaction. It only reads or inserts a shared ACTIVE variant with stock (committed once). User-specific data always lives inside the rolled-back transaction.

### Lifecycle tests

Operations that depend on prior steps (cart add → update → remove) are grouped in one `it(...)` block so they share a single transaction. Independent cases (401, empty cart, validation errors) stay in separate tests with their own `createTestUser()` call.

## Commands

```bash
npm test
npm run test:cart
npm run test:wishlist
npm run test:order
```

Requires `.env` with a migrated MySQL database (same as local dev).
