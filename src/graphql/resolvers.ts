import productRepository from '../repositories/product.repository';
import { query } from '../config/db';
import type { RowDataPacket } from 'mysql2';
import type { ProductDiscoveryQuery } from '../types/product';
import type { GraphQLContext } from './context';

interface UserDashboardProfile {
  id: number;
  fullName: string;
  email: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  email: string | null;
}

interface OrderSnapshotRow extends RowDataPacket {
  id: number;
  order_number: string;
  total_lkr: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  created_at: Date;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface ProductDiscoveryInput {
  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sortBy?: ProductDiscoveryQuery['sortBy'];
  sortOrder?: ProductDiscoveryQuery['sortOrder'];
  page?: number | null;
  limit?: number | null;
}

interface DiscoverProductsArgs {
  filter?: ProductDiscoveryInput | null;
}

export const resolvers = {
  Query: {
    discoverProducts: async (_parent: unknown, { filter }: DiscoverProductsArgs) => {
      const queryInput = filter ?? {};

      const repositoryFilters: ProductDiscoveryQuery = {
        search: queryInput.search ?? undefined,
        minPrice: queryInput.minPrice ?? undefined,
        maxPrice: queryInput.maxPrice ?? undefined,
        sortBy: queryInput.sortBy ?? 'date_created',
        sortOrder: queryInput.sortOrder ?? 'DESC',
        page: queryInput.page ? Math.max(1, queryInput.page) : 1,
        limit: queryInput.limit ? Math.max(1, queryInput.limit) : 20,
      };

      const { items, total } = await productRepository.discoverProducts(repositoryFilters);
      const perPage = repositoryFilters.limit ?? 20;
      const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);

      return {
        success: true,
        meta: {
          total_items: total,
          current_page: repositoryFilters.page ?? 1,
          per_page: perPage,
          total_pages: totalPages,
        },
        data: items,
      };
    },
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('UNAUTHENTICATED');
      }

      const rows = await query<UserRow>(
        'SELECT id, email FROM users WHERE id = ? LIMIT 1',
        [context.user.id],
      );
      if (rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      const user = rows[0];
      const fullName =
        user.email && user.email.includes('@')
          ? user.email.split('@')[0]
          : `user-${user.id}`;

      return {
        id: user.id,
        fullName,
        email: user.email ?? '',
      } satisfies UserDashboardProfile;
    },
  },
  UserDashboardProfile: {
    orders: async (parent: UserDashboardProfile) => {
      const rows = await query<OrderSnapshotRow>(
        `SELECT id, order_number, total_lkr, status, payment_status, fulfillment_status, created_at
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [parent.id],
      );
      return rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        totalLkr: Number(row.total_lkr),
        status: row.status,
        paymentStatus: row.payment_status,
        fulfillmentStatus: row.fulfillment_status,
        createdAt: row.created_at.toISOString(),
      }));
    },
    wishlistCount: async (parent: UserDashboardProfile) => {
      const rows = await query<CountRow>(
        `SELECT COUNT(*) AS count
         FROM wishlist_items wi
         INNER JOIN wishlists w ON wi.wishlist_id = w.id
         WHERE w.user_id = ?`,
        [parent.id],
      );
      return Number(rows[0]?.count ?? 0);
    },
  },
};
