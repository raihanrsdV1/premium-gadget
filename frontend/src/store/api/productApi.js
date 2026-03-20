import { apiSlice } from './apiSlice';

export const productApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query({
      query: (params) => ({ url: '/products', params }),
      providesTags: ['Product'],
    }),
    getFeaturedProducts: builder.query({
      query: () => '/products/featured',
      providesTags: ['Product'],
    }),
    searchProducts: builder.query({
      query: (params) => ({ url: '/products/search', params }),
      providesTags: ['Product'],
    }),
    getProductBySlug: builder.query({
      query: (slug) => `/products/${slug}`,
      providesTags: (result, error, slug) => [{ type: 'Product', id: slug }],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetFeaturedProductsQuery,
  useSearchProductsQuery,
  useGetProductBySlugQuery,
} = productApi;
