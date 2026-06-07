"use client";

import { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { hydrateCart } from "@/store/slices/cartSlice";
import { hydrateAuth } from "@/store/slices/authSlice";

const CART_KEY = "cart";

/**
 * Client-only Redux provider.
 *
 * The store is created once per client. Persisted cart + auth are loaded AFTER
 * mount (so server HTML and the first client render are identical -> no
 * hydration warnings). The cart is then persisted back to localStorage on
 * every change.
 */
export default function StoreProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    const store = storeRef.current;

    // Hydrate cart
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) store.dispatch(hydrateCart(JSON.parse(raw)));
    } catch {
      /* ignore corrupt cart */
    }

    // Hydrate auth (token + user written by setCredentials/legacy app)
    try {
      const token = localStorage.getItem("token");
      const user = JSON.parse(localStorage.getItem("user"));
      if (token) store.dispatch(hydrateAuth({ token, user }));
    } catch {
      /* ignore corrupt auth */
    }

    // Persist cart on change
    const unsubscribe = store.subscribe(() => {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(store.getState().cart));
      } catch {
        /* storage full / unavailable */
      }
    });
    return unsubscribe;
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
