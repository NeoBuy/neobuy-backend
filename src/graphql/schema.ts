export const typeDefs = `#graphql
  enum SortByOption {
    date_created
    price
    name
    most_sold
  }

  enum SortOrderOption {
    ASC
    DESC
  }

  input ProductDiscoveryInput {
    search: String
    minPrice: Int
    maxPrice: Int
    sortBy: SortByOption
    sortOrder: SortOrderOption
    page: Int
    limit: Int
  }

  type PaginationMeta {
    total_items: Int!
    current_page: Int!
    per_page: Int!
    total_pages: Int!
  }

  type CatalogProductVariant {
    id: ID!
    sku: String!
    title: String
    price_lkr: Int!
    compare_at_price_lkr: Int
    quantity: Int!
  }

  type CatalogProductItem {
    id: ID!
    title: String!
    description: String!
    created_at: String!
    primary_image_url: String
    min_price_lkr: Int!
    total_sales: Int!
    variants: [CatalogProductVariant!]!
  }

  type PaginatedDiscoveryResponse {
    success: Boolean!
    meta: PaginationMeta!
    data: [CatalogProductItem!]!
  }

  type Query {
    discoverProducts(filter: ProductDiscoveryInput): PaginatedDiscoveryResponse!
  }
`;
