import { apiSlice } from './apiSlice';

// Small lookups many admin screens share.
export const commonApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBranchesAdmin: builder.query({
      query: () => '/branches/admin',
      transformResponse: (res) => res.data,
      providesTags: ['Branch'],
    }),
  }),
});

export const { useGetBranchesAdminQuery } = commonApi;
