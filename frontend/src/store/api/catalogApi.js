import { apiSlice } from './apiSlice';

// Catalog: products (+ variants, specs, key features, photos), categories
// (+ spec templates), brands and homepage banners.
//
// Product writes that return the full product (or one of its lists) patch the
// cached `getAdminProduct` entry directly, so the editor shows the saved state
// at once without a refetch; lists are refreshed through tags.

const PRODUCT_LIST = { type: 'Product', id: 'LIST' };
const CATEGORY_LIST = { type: 'Category', id: 'LIST' };
const TEMPLATES = { type: 'Category', id: 'TEMPLATE' };
const BRAND_LIST = { type: 'Brand', id: 'LIST' };
const BANNER_LIST = { type: 'Banner', id: 'LIST' };
// Collections reuse the Product tag type (the shared tag list has no Collection).
const COLLECTION_LIST = { type: 'Product', id: 'COLLECTIONS' };
const PRICE_HISTORY = (id) => ({ type: 'Product', id: `PRICES-${id}` });

/** Drop empty filter values so the URL stays clean (?status=&q= → nothing). */
const cleanParams = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const catalogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => {
    /** After a write, replace part of the cached admin product with the response. */
    const patchProduct = (productId, apply) => async (_arg, { dispatch, queryFulfilled }) => {
      try {
        const { data } = await queryFulfilled;
        dispatch(catalogApi.util.updateQueryData('getAdminProduct', productId(_arg), (draft) => apply(draft, data, _arg)));
      } catch {
        // The caller shows the error; nothing to patch.
      }
    };

    return {
      // ─── Products ─────────────────────────────────────────
      getAdminProducts: builder.query({
        query: (params) => ({ url: '/products/admin', params: cleanParams(params) }),
        transformResponse: (res) => ({ rows: res.data, pagination: res.pagination }),
        providesTags: (result) => [
          PRODUCT_LIST,
          ...(result?.rows || []).map((p) => ({ type: 'Product', id: p.id })),
        ],
      }),
      getAdminProduct: builder.query({
        query: (id) => `/products/admin/${id}`,
        transformResponse: (res) => res.data,
        providesTags: (_r, _e, id) => [{ type: 'Product', id }],
      }),
      createProduct: builder.mutation({
        query: (body) => ({ url: '/products', method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST, CATEGORY_LIST, BRAND_LIST, 'Inventory'],
      }),
      /** PUT /products/:id → the full admin product. */
      updateProduct: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/products/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST, CATEGORY_LIST, BRAND_LIST, BANNER_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (_draft, data) => data),
      }),
      deleteProduct: builder.mutation({
        query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
        invalidatesTags: (_r, _e, id) => [PRODUCT_LIST, { type: 'Product', id }, CATEGORY_LIST, BRAND_LIST, BANNER_LIST, 'Inventory'],
      }),

      // ─── Variants ─────────────────────────────────────────
      createVariant: builder.mutation({
        query: ({ productId, ...body }) => ({ url: `/products/${productId}/variants`, method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: (_r, _e, { productId }) => [PRODUCT_LIST, { type: 'Product', id: productId }, 'Inventory'],
      }),
      /** Price changes are audited with the actor's name. */
      updateVariant: builder.mutation({
        query: ({ id, productId: _productId, ...body }) => ({ url: `/products/variants/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: (_r, _e, { productId }) => [PRODUCT_LIST, BANNER_LIST, 'Inventory', PRICE_HISTORY(productId)],
        onQueryStarted: patchProduct((arg) => arg.productId, (draft, variant) => {
          const i = draft.variants.findIndex((v) => v.id === variant.id);
          if (i >= 0) draft.variants[i] = variant;
        }),
      }),
      /** → { id, deleted, deactivated, reason? } (in-use variants are deactivated). */
      deleteVariant: builder.mutation({
        query: ({ id }) => ({ url: `/products/variants/${id}`, method: 'DELETE' }),
        transformResponse: (res) => ({ ...res.data, message: res.message }),
        invalidatesTags: (_r, _e, { productId }) => [PRODUCT_LIST, { type: 'Product', id: productId }, 'Inventory'],
      }),

      // ─── Specifications & key features (replace the whole list) ──
      replaceSpecifications: builder.mutation({
        query: ({ id, specifications }) => ({ url: `/products/${id}/specifications`, method: 'PUT', body: { specifications } }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (draft, rows) => { draft.specifications = rows; }),
      }),
      replaceKeyFeatures: builder.mutation({
        query: ({ id, key_features }) => ({ url: `/products/${id}/key-features`, method: 'PUT', body: { key_features } }),
        transformResponse: (res) => res.data,
        onQueryStarted: patchProduct((arg) => arg.id, (draft, rows) => { draft.key_features = rows; }),
      }),

      // ─── Photos ───────────────────────────────────────────
      addProductImage: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/products/${id}/images`, method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST, BANNER_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (draft, image) => {
          if (image.is_primary) draft.images.forEach((img) => { img.is_primary = false; });
          draft.images.push(image);
        }),
      }),
      reorderProductImages: builder.mutation({
        query: ({ id, image_ids }) => ({ url: `/products/${id}/images/order`, method: 'PUT', body: { image_ids } }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (draft, images) => { draft.images = images; }),
      }),
      updateProductImage: builder.mutation({
        query: ({ id, imageId, ...body }) => ({ url: `/products/${id}/images/${imageId}`, method: 'PATCH', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST, BANNER_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (draft, images) => { draft.images = images; }),
      }),
      deleteProductImage: builder.mutation({
        query: ({ id, imageId }) => ({ url: `/products/${id}/images/${imageId}`, method: 'DELETE' }),
        transformResponse: (res) => res.data,
        invalidatesTags: [PRODUCT_LIST, BANNER_LIST],
        onQueryStarted: patchProduct((arg) => arg.id, (draft, images) => { draft.images = images; }),
      }),

      // ─── Categories ───────────────────────────────────────
      getCategoriesAdmin: builder.query({
        query: () => '/categories/admin',
        transformResponse: (res) => res.data,
        providesTags: [CATEGORY_LIST],
      }),
      createCategory: builder.mutation({
        query: (body) => ({ url: '/categories', method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [CATEGORY_LIST, TEMPLATES],
      }),
      updateCategory: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/categories/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        // A new parent changes which template a category inherits.
        invalidatesTags: [CATEGORY_LIST, TEMPLATES, PRODUCT_LIST],
      }),
      deleteCategory: builder.mutation({
        query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
        invalidatesTags: [CATEGORY_LIST, TEMPLATES],
      }),
      /** → { template, source_category_id } (template null when none up the chain). Staff route: works for hidden categories too. */
      getSpecTemplate: builder.query({
        query: (id) => `/categories/admin/${id}/spec-template`,
        transformResponse: (res) => res.data,
        providesTags: [TEMPLATES],
      }),
      /** Body is the template object, or null to remove this category's own template. */
      updateSpecTemplate: builder.mutation({
        // Wrapped, because a bare JSON null body isn't accepted by the API's parser.
        query: ({ id, template }) => ({ url: `/categories/${id}/spec-template`, method: 'PUT', body: { template } }),
        transformResponse: (res) => res.data,
        invalidatesTags: [TEMPLATES, CATEGORY_LIST],
      }),

      // ─── Brands ───────────────────────────────────────────
      getBrandsAdmin: builder.query({
        query: () => '/brands/admin',
        transformResponse: (res) => res.data,
        providesTags: [BRAND_LIST],
      }),
      createBrand: builder.mutation({
        query: (body) => ({ url: '/brands', method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [BRAND_LIST],
      }),
      updateBrand: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/brands/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [BRAND_LIST, PRODUCT_LIST],
      }),
      deleteBrand: builder.mutation({
        query: (id) => ({ url: `/brands/${id}`, method: 'DELETE' }),
        invalidatesTags: [BRAND_LIST],
      }),


      // ─── Collections ──────────────────────────────────────
      getCollectionsAdmin: builder.query({
        query: () => '/collections/admin',
        transformResponse: (res) => res.data,
        providesTags: [COLLECTION_LIST],
      }),
      getCollectionAdmin: builder.query({
        query: (id) => `/collections/admin/${id}`,
        transformResponse: (res) => res.data,
        providesTags: (_r, _e, id) => [{ type: 'Product', id: `COLLECTION-${id}` }],
      }),
      createCollection: builder.mutation({
        query: (body) => ({ url: '/collections', method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [COLLECTION_LIST],
      }),
      updateCollection: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/collections/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: (_r, _e, { id }) => [COLLECTION_LIST, { type: 'Product', id: `COLLECTION-${id}` }],
      }),
      deleteCollection: builder.mutation({
        query: (id) => ({ url: `/collections/${id}`, method: 'DELETE' }),
        invalidatesTags: [COLLECTION_LIST, PRODUCT_LIST],
      }),
      setCollectionProducts: builder.mutation({
        query: ({ id, product_ids }) => ({ url: `/collections/${id}/products`, method: 'PUT', body: { product_ids } }),
        invalidatesTags: (_r, _e, { id }) => [COLLECTION_LIST, PRODUCT_LIST, { type: 'Product', id: `COLLECTION-${id}` }],
      }),
      setCollectionHomeOrder: builder.mutation({
        query: (ids) => ({ url: '/collections/home-order', method: 'PUT', body: { ids } }),
        invalidatesTags: [COLLECTION_LIST],
      }),
      /** Replace a product's manual collections. */
      setProductCollections: builder.mutation({
        query: ({ id, collection_ids }) => ({ url: `/products/${id}/collections`, method: 'PUT', body: { collection_ids } }),
        invalidatesTags: (_r, _e, { id }) => [{ type: 'Product', id }, COLLECTION_LIST],
      }),
      getPriceHistory: builder.query({
        query: (id) => `/products/admin/${id}/price-history`,
        transformResponse: (res) => res.data,
        providesTags: (_r, _e, id) => [PRICE_HISTORY(id)],
      }),

      // ─── Homepage banners ─────────────────────────────────
      getBannersAdmin: builder.query({
        query: (placement) => ({ url: '/banners/admin', params: cleanParams({ placement }) }),
        transformResponse: (res) => res.data,
        providesTags: [BANNER_LIST],
      }),
      createBanner: builder.mutation({
        query: (body) => ({ url: '/banners', method: 'POST', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [BANNER_LIST],
      }),
      updateBanner: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/banners/${id}`, method: 'PUT', body }),
        transformResponse: (res) => res.data,
        invalidatesTags: [BANNER_LIST],
      }),
      reorderBanners: builder.mutation({
        query: ({ placement, ids }) => ({ url: '/banners/order', method: 'PUT', body: { placement, ids } }),
        invalidatesTags: [BANNER_LIST],
      }),
      deleteBanner: builder.mutation({
        query: (id) => ({ url: `/banners/${id}`, method: 'DELETE' }),
        invalidatesTags: [BANNER_LIST],
      }),
    };
  },
});

export const {
  useGetCollectionsAdminQuery,
  useGetCollectionAdminQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useSetCollectionProductsMutation,
  useSetCollectionHomeOrderMutation,
  useSetProductCollectionsMutation,
  useGetPriceHistoryQuery,
  useGetAdminProductsQuery,
  useGetAdminProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useCreateVariantMutation,
  useUpdateVariantMutation,
  useDeleteVariantMutation,
  useReplaceSpecificationsMutation,
  useReplaceKeyFeaturesMutation,
  useAddProductImageMutation,
  useReorderProductImagesMutation,
  useUpdateProductImageMutation,
  useDeleteProductImageMutation,
  useGetCategoriesAdminQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetSpecTemplateQuery,
  useUpdateSpecTemplateMutation,
  useGetBrandsAdminQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
  useGetBannersAdminQuery,
  useCreateBannerMutation,
  useUpdateBannerMutation,
  useReorderBannersMutation,
  useDeleteBannerMutation,
} = catalogApi;
