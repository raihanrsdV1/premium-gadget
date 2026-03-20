import { apiSlice } from './apiSlice';

export const repairApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRepairServices: builder.query({
      query: () => '/repairs/services',
    }),
    trackRepair: builder.query({
      query: ({ ticket_number, phone }) => ({
        url: '/repairs/track',
        params: { ticket_number, phone },
      }),
    }),
    createRepairTicket: builder.mutation({
      query: (ticketData) => ({
        url: '/repairs/tickets',
        method: 'POST',
        body: ticketData,
      }),
    }),
  }),
});

export const {
  useGetRepairServicesQuery,
  useTrackRepairQuery,
  useCreateRepairTicketMutation,
} = repairApi;
