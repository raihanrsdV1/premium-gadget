import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { logout } from '../slices/authSlice';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api/v1',
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// An expired or revoked session (401) signs the user out instead of leaving
// the admin looking logged in while every request fails.
const baseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401 && api.getState().auth.token) {
    api.dispatch(logout());
    api.dispatch(apiSlice.util.resetApiState());
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery,
  // One tag per resource; each domain API file injects its own endpoints.
  tagTypes: [
    'Profile', 'Settings', 'Branch', 'Product', 'Category', 'Brand', 'Banner', 'Media',
    'Inventory', 'Movement', 'Unit', 'Sale', 'Order', 'User', 'Coupon', 'Repair', 'Review',
  ],
  endpoints: () => ({}),
});

export default apiSlice;
