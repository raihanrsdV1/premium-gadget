import { apiSlice } from './apiSlice';

// Site settings: store info, social links, delivery zones, checkout rules, SEO.
// GET is staff-only; PUT /settings/:key is super_admin only and replaces that
// key's whole value (the API validates it strictly).
export const settingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminSettings: builder.query({
      query: () => '/settings/admin',
      transformResponse: (res) => res.data,
      providesTags: ['Settings'],
    }),
    updateSetting: builder.mutation({
      query: ({ key, value }) => ({ url: `/settings/${key}`, method: 'PUT', body: value }),
      invalidatesTags: ['Settings'],
    }),
  }),
});

export const { useGetAdminSettingsQuery, useUpdateSettingMutation } = settingsApi;
