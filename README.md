# NeoBuy Backend

TypeScript + Express API with MySQL and [db-migrate](https://db-migrate.readthedocs.io/) migrations.

## Setup

1. Copy environment file:

   ```bash
   cp .env.example .env
   ```

2. Create the MySQL database (empty):

   ```sql
   CREATE DATABASE neobuy_db_v1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Run migrations:

   ```bash
   npm install
   npm run migrate
   ```

4. Start API:

   ```bash
   npm run dev
   ```

   Production build:

   ```bash
   npm run build
   npm start
   ```

Health check: `GET http://localhost:4000/api/health`

Product discovery (GraphQL): `POST http://localhost:4000/graphql` — see [`docs/public_api/product/README.md`](docs/public_api/product/README.md)

## Migrations

| Command | Description |
|---------|-------------|
| `npm run migrate` | Apply pending migrations (dev) |
| `npm run migrate:down` | Roll back one migration |
| `npm run migrate:create -- name` | Create a new migration file |
| `npm run migrate:prod` | Apply migrations using `prod` env in `database.json` |

Migrations live in `migrations/` (JavaScript, db-migrate). Schema matches `docs/database.md`.

## Project layout

```
src/
  config/db.ts          # mysql2 connection pool
  middlewares/          # auth, errors
  graphql/              # Apollo schema + resolvers (catalog)
  routes/               # REST routes (auth, health)
  controllers/          # REST request/response
  services/             # REST business logic
  repositories/         # SQL data access
  types/                # shared TypeScript types
  utils/                # helpers (JWT, errors)
  app.ts                # Express entry
dist/                   # compiled output (npm run build)
migrations/             # db-migrate SQL migrations
database.json           # db-migrate connection config
```
