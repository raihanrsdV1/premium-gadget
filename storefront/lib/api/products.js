// Product API client for the storefront.
// Duplicated from the Vite app's API contract (frontend/src/store/api/productApi.js
// + axiosInstance.js) intentionally — the two apps do not share code.
//
// The Express backend returns { success, data, [pagination] } and already shapes
// the product (brand as string, images as URL[], specifications as
// {key,value}[], etc.) in product.service — so we just unwrap.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1";

async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  return res;
}

/**
 * Fetch a single product by slug, server-side.
 * @returns {Promise<object|null>} the product, or null if not found.
 */
export async function getProductBySlug(slug) {
  const res = await apiGet(`/products/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch product "${slug}": ${res.status}`);
  const json = await res.json();
  return json?.data ?? null;
}

/**
 * Fetch a paginated product list with optional filters.
 * @param {Record<string,string|number>} params - e.g. { page, limit, category, brand, condition }
 * @returns {Promise<{ data: object[], pagination: object|null }>}
 */
export async function getProducts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const res = await apiGet(`/products?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  const json = await res.json();
  return { data: json?.data ?? [], pagination: json?.pagination ?? null };
}

/**
 * Fetch featured products (home page).
 * @returns {Promise<object[]>}
 */
export async function getFeaturedProducts() {
  const res = await apiGet(`/products/featured`);
  if (!res.ok) throw new Error(`Failed to fetch featured products: ${res.status}`);
  const json = await res.json();
  return json?.data ?? [];
}

/**
 * Search products by query (trigram fuzzy search on the backend).
 * @returns {Promise<{ data: object[], pagination: object|null }>}
 */
export async function searchProducts(q, params = {}) {
  if (!q || q.trim().length < 2) return { data: [], pagination: null };
  const qs = new URLSearchParams({ q: q.trim(), ...params });
  const res = await apiGet(`/products/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed to search products: ${res.status}`);
  const json = await res.json();
  return { data: json?.data ?? [], pagination: json?.pagination ?? null };
}
