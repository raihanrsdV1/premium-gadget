import { apiFetch } from "./http";

// GET /orders?mine=true — returns the authenticated user's orders.
// NOTE: the backend order list is currently a stub returning an empty array
// (real order creation is a deferred phase), so this resolves to [] for now.
export async function getMyOrders() {
  const json = await apiFetch("/orders?mine=true", { auth: true });
  return json?.data ?? [];
}
