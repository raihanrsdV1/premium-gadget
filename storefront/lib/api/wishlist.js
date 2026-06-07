import { apiFetch } from "./http";

export async function getWishlist() {
  const json = await apiFetch("/wishlists", { auth: true });
  return json?.data ?? [];
}

export function addToWishlist(productId) {
  return apiFetch("/wishlists", { method: "POST", body: { product_id: productId }, auth: true });
}

export function removeFromWishlist(productId) {
  return apiFetch(`/wishlists/${productId}`, { method: "DELETE", auth: true });
}
