import { apiFetch } from "./http";

// GET /orders/mine — the authenticated user's orders (with line items).
export async function getMyOrders() {
  const json = await apiFetch("/orders/mine", { auth: true });
  return json?.data ?? [];
}

// GET /orders/mine/:orderNumber — a single order (with line items).
export async function getMyOrder(orderNumber) {
  const json = await apiFetch(`/orders/mine/${encodeURIComponent(orderNumber)}`, { auth: true });
  return json?.data ?? null;
}

/**
 * Place an online order (Phase A). Returns { order_id, order_number, total,
 * redirect_url }. redirect_url is the SSLCommerz gateway URL to send the
 * browser to; it may be null if the gateway session couldn't be created (the
 * order is still placed as pending with stock reserved).
 */
export async function createOrder(payload) {
  const json = await apiFetch("/orders/checkout", { method: "POST", body: payload, auth: true });
  return json?.data ?? null;
}
