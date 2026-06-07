import { createSlice } from "@reduxjs/toolkit";

/*
 * Auth slice for the storefront.
 *
 * Ported from frontend/src/store/slices/authSlice.js, but SSR-safe: the legacy
 * slice read localStorage at module init, which crashes during server render.
 * Here we start empty (identical on server + first client render -> no
 * hydration mismatch) and load persisted credentials on the client via
 * hydrateAuth(), dispatched from StoreProvider after mount.
 */
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
};

const isBrowser = () => typeof window !== "undefined";

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, token } = action.payload;
      state.user = user;
      state.token = token;
      state.isAuthenticated = true;
      if (isBrowser()) {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
      }
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      if (isBrowser()) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    },
    // Load persisted credentials on the client (no localStorage writes).
    hydrateAuth: (state, action) => {
      const { user, token } = action.payload || {};
      if (token) {
        state.user = user || null;
        state.token = token;
        state.isAuthenticated = true;
      }
    },
  },
});

export const { setCredentials, logout, hydrateAuth } = authSlice.actions;
export default authSlice.reducer;
