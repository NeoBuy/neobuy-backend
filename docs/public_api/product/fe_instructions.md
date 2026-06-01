# Next.js frontend — product discovery (GraphQL)

This guide shows how to consume NeoBuy’s public **`discoverProducts`** query from a Next.js app (App Router). Auth stays on REST (`/api/auth`); catalog discovery uses **`POST /graphql`** only.

---

## 1. Environment

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Production:

```env
NEXT_PUBLIC_API_URL=https://api.your-neobuy-domain.com
```

---

## 2. Choose a client

| Approach | Best for |
|----------|----------|
| **Apollo Client** | Client components, caches, variables, devtools |
| **`fetch` + typed document** | Server Components, minimal bundle, RSC-first apps |

Both are valid. Use **different queries per layout** (grid vs detail) so you never over-fetch.

---

## 3. Option A — Apollo Client (client components)

### Install

```bash
npm install @apollo/client graphql
```

### Provider (`app/providers.tsx`)

```tsx
'use client';

import { ApolloClient, HttpLink, InMemoryCache, ApolloProvider } from '@apollo/client';
import { ReactNode } from 'react';

const client = new ApolloClient({
  link: new HttpLink({
    uri: `${process.env.NEXT_PUBLIC_API_URL}/graphql`,
  }),
  cache: new InMemoryCache(),
});

export function Providers({ children }: { children: ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

Wrap `app/layout.tsx`:

```tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Search grid query (`lib/graphql/discovery.ts`)

```ts
import { gql } from '@apollo/client';

export const SEARCH_GRID = gql`
  query SearchGrid($filter: ProductDiscoveryInput) {
    discoverProducts(filter: $filter) {
      success
      meta {
        total_items
        current_page
        total_pages
        per_page
      }
      data {
        id
        title
        primary_image_url
        min_price_lkr
      }
    }
  }
`;
```

### Grid component (`components/ProductSearchGrid.tsx`)

```tsx
'use client';

import { useQuery } from '@apollo/client';
import Image from 'next/image';
import { SEARCH_GRID } from '@/lib/graphql/discovery';

type Props = {
  search?: string;
  page?: number;
};

export function ProductSearchGrid({ search, page = 1 }: Props) {
  const { data, loading, error } = useQuery(SEARCH_GRID, {
    variables: {
      filter: {
        search: search || undefined,
        sortBy: 'price',
        sortOrder: 'ASC',
        page,
        limit: 24,
      },
    },
  });

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Something went wrong.</p>;

  const result = data?.discoverProducts;
  const products = result?.data ?? [];

  return (
    <section>
      <p>{result?.meta.total_items ?? 0} products</p>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            {p.primary_image_url && (
              <Image
                src={p.primary_image_url}
                alt={p.title}
                width={300}
                height={300}
                className="aspect-square object-cover"
              />
            )}
            <h3>{p.title}</h3>
            <p>From Rs. {p.min_price_lkr.toLocaleString('en-LK')}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

### Detail drawer query (request more fields)

```ts
import { gql } from '@apollo/client';

export const PRODUCT_DETAILS = gql`
  query ProductDetails($filter: ProductDiscoveryInput) {
    discoverProducts(filter: $filter) {
      data {
        id
        title
        description
        primary_image_url
        min_price_lkr
        total_sales
        variants {
          id
          sku
          title
          price_lkr
          compare_at_price_lkr
          quantity
        }
      }
    }
  }
`;
```

Open the drawer with a **narrow filter** (e.g. exact title from grid, or add `productById` on the API later). Example using search text from the card:

```tsx
const { data } = useQuery(PRODUCT_DETAILS, {
  variables: { filter: { search: productTitle, limit: 1 } },
  skip: !open,
});
const product = data?.discoverProducts?.data?.[0];
```

---

## 4. Option B — Server Component + `fetch` (RSC)

No Apollo on the server bundle; good for SEO and first paint.

```ts
// lib/neobuy-graphql.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function discoverProducts<TData>(body: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<TData> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 60 }, // ISR: adjust per route
  });

  if (!res.ok) throw new Error('GraphQL request failed');

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as TData;
}
```

```tsx
// app/shop/page.tsx
import { discoverProducts } from '@/lib/neobuy-graphql';

const SEARCH_GRID = `
  query SearchGrid($filter: ProductDiscoveryInput) {
    discoverProducts(filter: $filter) {
      meta { total_items total_pages current_page }
      data { id title primary_image_url min_price_lkr }
    }
  }
`;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;

  const data = await discoverProducts<{
    discoverProducts: {
      meta: { total_items: number; total_pages: number; current_page: number };
      data: Array<{
        id: string;
        title: string;
        primary_image_url: string | null;
        min_price_lkr: number;
      }>;
    };
  }>({
    query: SEARCH_GRID,
    variables: {
      filter: {
        search: q || undefined,
        page: Number(page) || 1,
        limit: 24,
        sortBy: 'date_created',
        sortOrder: 'DESC',
      },
    },
  });

  const { meta, data: products } = data.discoverProducts;

  return (
    <main>
      <h1>Shop</h1>
      <p>{meta.total_items} items</p>
      {/* render products */}
    </main>
  );
}
```

Use a **client** detail drawer with `fetch` + `useEffect` or Apollo only for the panel if you need interactivity without a full navigation.

---

## 5. Pagination pattern

Drive page state from the URL so grids are shareable:

```
/shop?q=shirt&page=2
```

Pass `filter.page` and read `meta.total_pages` to render prev/next. Disable “next” when `current_page >= total_pages`.

---

## 6. Price display (LKR)

All money fields are **integers in whole LKR** (no cents). Format for Sri Lankan locale:

```ts
export function formatLkr(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-LK')}`;
}
```

Use `min_price_lkr` on cards (“From Rs. …”) and `variants[].price_lkr` on the detail view.

---

## 7. Stock and compare-at price

```tsx
{variant.compare_at_price_lkr != null &&
  variant.compare_at_price_lkr > variant.price_lkr && (
    <span className="line-through text-muted">
      {formatLkr(variant.compare_at_price_lkr)}
    </span>
  )}
<span>{formatLkr(variant.price_lkr)}</span>
<span>{variant.quantity > 0 ? 'In stock' : 'Out of stock'}</span>
```

---

## 8. Auth vs catalog

| Concern | Protocol | Base path |
|---------|----------|-----------|
| Register / login | REST JSON | `/api/auth/register`, `/api/auth/login` |
| Health | REST | `/api/health` |
| Product discovery | GraphQL | `/graphql` → `discoverProducts` |

Store the JWT from login (e.g. `httpOnly` cookie or secure storage). Attach `Authorization: Bearer <token>` only to **protected** REST routes when you add cart/checkout—not to public `discoverProducts`.

---

## 9. Typed operations (recommended)

Generate types from the schema once it stabilizes:

```bash
npx graphql-codegen --config codegen.ts
```

Point `schema` at `http://localhost:4000/graphql` (introspection) or copy `src/graphql/schema.ts` into the frontend repo. Use generated `ProductDiscoveryInput` and query result types in components.

---

## 10. Checklist

- [ ] `NEXT_PUBLIC_API_URL` set per environment  
- [ ] Grid query selects **only** card fields  
- [ ] Detail query adds `description` + `variants`  
- [ ] Pagination uses `meta` + URL `page` param  
- [ ] LKR formatted with `en-LK` locale  
- [ ] Auth uses REST; catalog uses GraphQL only  
- [ ] CORS: backend already uses `cors()` — configure production origins when deploying  

For full field reference and examples, see [`README.md`](./README.md).
