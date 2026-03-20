import { apiSlice } from './apiSlice';

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Products
    adminGetProducts: builder.query({
      query: (params) => ({ url: '/products', params }),
      providesTags: ['Product'],
    }),
    adminCreateProduct: builder.mutation({
      query: (data) => ({ url: '/products', method: 'POST', body: data }),
      invalidatesTags: ['Product'],
    }),
    adminUpdateProduct: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/products/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Product'],
    }),
    adminDeleteProduct: builder.mutation({
      query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product'],
    }),
    // Orders
    adminGetOrders: builder.query({
      query: (params) => ({ url: '/orders', params }),
      providesTags: ['Order'],
    }),
    adminUpdateOrder: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/orders/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Order'],
    }),
    // Users
    adminGetUsers: builder.query({
      query: (params) => ({ url: '/users', params }),
      providesTags: ['User'],
    }),
    // Repairs
    adminGetRepairTickets: builder.query({
      query: (params) => ({ url: '/repairs/tickets', params }),
    }),
    adminUpdateRepairTicket: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/repairs/tickets/${id}`, method: 'PUT', body: data }),
    }),
    // Branches
    adminGetBranches: builder.query({
      query: () => '/branches',
    }),
    // Coupons
    adminGetCoupons: builder.query({
      query: () => '/coupons',
    }),
    // Inventory
    adminGetInventory: builder.query({
      query: (params) => ({ url: '/inventory', params }),
    }),
  }),
});

export const {
  useAdminGetProductsQuery,
  useAdminCreateProductMutation,
  useAdminUpdateProductMutation,
  useAdminDeleteProductMutation,
  useAdminGetOrdersQuery,
  useAdminUpdateOrderMutation,
  useAdminGetUsersQuery,
  useAdminGetRepairTicketsQuery,
  useAdminUpdateRepairTicketMutation,
  useAdminGetBranchesQuery,
  useAdminGetCouponsQuery,
  useAdminGetInventoryQuery,
} = adminApi;
