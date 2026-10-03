import { apiSlice } from './apiSlice';

// Image uploads (re-encoded to WebP on the server, stored in R2 in production).
export const mediaApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    uploadImages: builder.mutation({
      query: (files) => {
        const form = new FormData();
        [...files].forEach((f) => form.append('images', f));
        return { url: '/uploads/images', method: 'POST', body: form };
      },
      transformResponse: (res) => res.data,
    }),
    deleteMedia: builder.mutation({
      query: (id) => ({ url: `/uploads/${id}`, method: 'DELETE' }),
    }),
  }),
});

export const { useUploadImagesMutation, useDeleteMediaMutation } = mediaApi;
