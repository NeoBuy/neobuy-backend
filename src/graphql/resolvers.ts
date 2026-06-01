import productRepository from '../repositories/product.repository';
import type { ProductDiscoveryQuery } from '../types/product';

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
  },
};
