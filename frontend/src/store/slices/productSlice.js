import { createSlice } from '@reduxjs/toolkit';

const productSlice = createSlice({
  name: 'products',
  initialState: {
    filters: {},
    searchTerm: '',
  },
  reducers: {
    setFilters: (state, action) => { state.filters = action.payload; },
  },
});

export const { setFilters } = productSlice.actions;
export default productSlice.reducer;
