import { apiSlice } from './apiSlice';

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({ url: '/auth/login', method: 'POST', body: credentials }),
    }),
    getProfile: builder.query({
      query: () => '/auth/profile',
      transformResponse: (res) => res.data,
      providesTags: ['Profile'],
    }),
    changePassword: builder.mutation({
      query: (body) => ({ url: '/auth/password/change', method: 'POST', body }),
    }),
  }),
});

export const { useLoginMutation, useGetProfileQuery, useChangePasswordMutation } = authApi;
