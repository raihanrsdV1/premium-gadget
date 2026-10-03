import { apiSlice } from './apiSlice';

// Operations: orders, inventory (stock, ledger, serial units) and POS.
// List endpoints keep the API's `{ data, pagination[, summary] }` envelope;
// single-record endpoints return `data`.

const clean = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
);

const listTags = (type) => (res) => [
  { type, id: 'LIST' },
  ...((res?.data || []).map((r) => ({ type, id: r.id }))),
];

// Anything that moves stock refreshes stock, the ledger and serial units.
const STOCK_TAGS = [{ type: 'Inventory', id: 'LIST' }, { type: 'Movement', id: 'LIST' }, { type: 'Unit', id: 'LIST' }];

export const opsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Orders ────────────────────────────────────────────
    getOrders: builder.query({
      query: (params) => ({ url: '/orders', params: clean(params) }),
      providesTags: listTags('Order'),
    }),
    getOrder: builder.query({
      query: (id) => `/orders/${id}`,
      transformResponse: (res) => res.data,
      providesTags: (r, e, id) => [{ type: 'Order', id }],
    }),
    updateOrderStatus: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, ...STOCK_TAGS],
    }),
    updateOrderNote: builder.mutation({
      query: ({ id, admin_note: adminNote }) => ({ url: `/orders/${id}`, method: 'PATCH', body: { admin_note: adminNote } }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }],
    }),
    markOrderRefunded: builder.mutation({
      query: ({ id, note }) => ({ url: `/orders/${id}/payment`, method: 'PATCH', body: { payment_status: 'refunded', note } }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }],
    }),
    reconcileOrderPayment: builder.mutation({
      query: (id) => `/payments/orders/${id}/reconcile`,
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, id) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, ...STOCK_TAGS],
    }),

    // ─── Activity log (super admin) ────────────────────────
    getAuditLog: builder.query({
      query: (params) => ({ url: '/audit-log', params: clean(params) }),
    }),
    getAuditActions: builder.query({
      query: () => '/audit-log/actions',
      transformResponse: (res) => res.data,
    }),
    getStaffList: builder.query({
      query: (role) => ({ url: '/users', params: { role, limit: 100 } }),
      transformResponse: (res) => res.data,
    }),

    // ─── Inventory ─────────────────────────────────────────
    getInventory: builder.query({
      query: (params) => ({ url: '/inventory', params: clean(params) }),
      providesTags: listTags('Inventory'),
    }),
    getInventoryRow: builder.query({
      query: (id) => `/inventory/${id}`,
      transformResponse: (res) => res.data,
      providesTags: (r, e, id) => [{ type: 'Inventory', id }],
    }),
    createInventory: builder.mutation({
      query: (body) => ({ url: '/inventory', method: 'POST', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: STOCK_TAGS,
    }),
    updateInventory: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/inventory/${id}`, method: 'PUT', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [{ type: 'Inventory', id }, ...STOCK_TAGS],
    }),
    adjustInventory: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/inventory/${id}/adjust`, method: 'POST', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [{ type: 'Inventory', id }, ...STOCK_TAGS],
    }),
    transferStock: builder.mutation({
      query: (body) => ({ url: '/inventory/transfer', method: 'POST', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: STOCK_TAGS,
    }),
    deleteInventory: builder.mutation({
      query: (id) => ({ url: `/inventory/${id}`, method: 'DELETE' }),
      invalidatesTags: STOCK_TAGS,
    }),
    getMovements: builder.query({
      query: (params) => ({ url: '/inventory/movements', params: clean(params) }),
      providesTags: [{ type: 'Movement', id: 'LIST' }],
    }),
    getUnits: builder.query({
      query: (params) => ({ url: '/inventory/units', params: clean(params) }),
      providesTags: listTags('Unit'),
    }),
    createUnit: builder.mutation({
      query: (body) => ({ url: '/inventory/units', method: 'POST', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: STOCK_TAGS,
    }),
    updateUnit: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/inventory/units/${id}`, method: 'PATCH', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: STOCK_TAGS,
    }),

    // ─── POS ───────────────────────────────────────────────
    posCatalog: builder.query({
      query: (params) => ({ url: '/pos/catalog', params: clean(params) }),
      transformResponse: (res) => res.data,
      keepUnusedDataFor: 15,
      providesTags: [{ type: 'Inventory', id: 'LIST' }],
    }),
    createSale: builder.mutation({
      query: (body) => ({ url: '/pos/sales', method: 'POST', body }),
      transformResponse: (res) => res.data,
      invalidatesTags: [{ type: 'Sale', id: 'LIST' }, { type: 'Order', id: 'LIST' }, ...STOCK_TAGS],
    }),
    getSales: builder.query({
      query: (params) => ({ url: '/pos/sales', params: clean(params) }),
      providesTags: listTags('Sale'),
    }),
    getSale: builder.query({
      query: (id) => `/pos/sales/${id}`,
      transformResponse: (res) => res.data,
      providesTags: (r, e, id) => [{ type: 'Sale', id }],
    }),
    voidSale: builder.mutation({
      query: ({ id, reason }) => ({ url: `/pos/sales/${id}/void`, method: 'POST', body: { reason } }),
      transformResponse: (res) => res.data,
      invalidatesTags: (r, e, { id }) => [
        { type: 'Sale', id }, { type: 'Sale', id: 'LIST' }, { type: 'Order', id }, { type: 'Order', id: 'LIST' }, ...STOCK_TAGS,
      ],
    }),
  }),
});

export const {
  useGetAuditLogQuery,
  useGetAuditActionsQuery,
  useGetStaffListQuery,
  useGetOrdersQuery,
  useGetOrderQuery,
  useUpdateOrderStatusMutation,
  useUpdateOrderNoteMutation,
  useMarkOrderRefundedMutation,
  useReconcileOrderPaymentMutation,
  useGetInventoryQuery,
  useGetInventoryRowQuery,
  useCreateInventoryMutation,
  useUpdateInventoryMutation,
  useAdjustInventoryMutation,
  useTransferStockMutation,
  useDeleteInventoryMutation,
  useGetMovementsQuery,
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  usePosCatalogQuery,
  useLazyPosCatalogQuery,
  useCreateSaleMutation,
  useGetSalesQuery,
  useGetSaleQuery,
  useVoidSaleMutation,
} = opsApi;
