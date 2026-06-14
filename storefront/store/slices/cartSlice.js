import { createSlice } from "@reduxjs/toolkit";

/*
 * Cart slice for the storefront.
 *
 * Ported from frontend/src/store/slices/cartSlice.js but with two corrections
 * the legacy slice lacked (the legacy app's cart was in-memory only and ignored
 * quantity): it respects payload.quantity and keeps display fields
 * (image/slug/variantName) so the cart + checkout can render line items.
 * State shape and action names are kept compatible for easy porting.
 */
const initialState = {
  items: [],
  totalQuantity: 0,
  totalAmount: 0,
};

function recompute(state) {
  state.totalQuantity = state.items.reduce((n, i) => n + i.quantity, 0);
  state.totalAmount = state.items.reduce((sum, i) => sum + i.totalPrice, 0);
}

// Clamp a desired quantity to [1, maxStock] (maxStock falsy = no client cap;
// the backend reservation is always the authoritative check).
function clampQty(qty, maxStock) {
  const q = Math.max(1, qty);
  return maxStock ? Math.min(q, maxStock) : q;
}

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addItem(state, action) {
      const { id, name, price, image, slug, variantName, quantity = 1, maxStock } =
        action.payload;
      const existing = state.items.find((i) => i.id === id);
      if (existing) {
        // Keep the freshest stock figure if provided.
        if (maxStock != null) existing.maxStock = maxStock;
        existing.quantity = clampQty(existing.quantity + quantity, existing.maxStock);
        existing.totalPrice = existing.quantity * existing.price;
      } else {
        const qty = clampQty(quantity, maxStock);
        state.items.push({
          id,
          name,
          price,
          image: image || "",
          slug: slug || "",
          variantName: variantName || "",
          maxStock: maxStock ?? null,
          quantity: qty,
          totalPrice: price * qty,
        });
      }
      recompute(state);
    },
    // Decrement one unit (removes the line when it hits zero).
    removeItem(state, action) {
      const id = action.payload;
      const existing = state.items.find((i) => i.id === id);
      if (!existing) return;
      if (existing.quantity <= 1) {
        state.items = state.items.filter((i) => i.id !== id);
      } else {
        existing.quantity -= 1;
        existing.totalPrice = existing.quantity * existing.price;
      }
      recompute(state);
    },
    // Remove an entire line regardless of quantity.
    deleteItem(state, action) {
      state.items = state.items.filter((i) => i.id !== action.payload);
      recompute(state);
    },
    setQuantity(state, action) {
      const { id, quantity } = action.payload;
      const existing = state.items.find((i) => i.id === id);
      if (!existing) return;
      existing.quantity = clampQty(quantity, existing.maxStock);
      existing.totalPrice = existing.quantity * existing.price;
      recompute(state);
    },
    clearCart(state) {
      state.items = [];
      state.totalQuantity = 0;
      state.totalAmount = 0;
    },
    // Replace state from persisted localStorage (client hydration).
    hydrateCart(state, action) {
      const payload = action.payload;
      if (payload && Array.isArray(payload.items)) {
        state.items = payload.items;
        recompute(state);
      }
    },
  },
});

export const {
  addItem,
  removeItem,
  deleteItem,
  setQuantity,
  clearCart,
  hydrateCart,
} = cartSlice.actions;

export default cartSlice.reducer;
