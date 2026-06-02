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

  type UserDashboardProfile {
    id: ID!
    fullName: String!
    email: String!
    orders: [OrderSnapshot!]!
    wishlistCount: Int!
  }

  type OrderSnapshot {
    id: ID!
    orderNumber: String!
    totalLkr: Float!
    status: String!
    paymentStatus: String!
    fulfillmentStatus: String!
    createdAt: String!
  }

  type Query {
    discoverProducts(filter: ProductDiscoveryInput): PaginatedDiscoveryResponse!
    me: UserDashboardProfile!
  }
`;
