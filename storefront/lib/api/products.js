// Product API client for the storefront.
// Duplicated from the Vite app's API contract (frontend/src/store/api/productApi.js
// + axiosInstance.js) intentionally — the two apps do not share code.
//
// The Express backend returns { success, data, [pagination] } and already shapes
// the product (brand as string, images as URL[], specifications as
// {key,value}[], etc.) in product.service — so we just unwrap.
//
// This module is shared: Server Components use it for catalog reads (cached in
// Next's Data Cache, tagged so the backend can revalidate on write), and the
// browser uses it for search and the cart's variant/stock check (never cached).

import { isSlug } from "@/lib/seo";
import { fetchWithRetry } from "@/lib/api/retry";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1";

/** Catalog reads are cached for 5 minutes, or until the backend revalidates their tag. */
export const CATALOG_REVALIDATE = 300;

// Server-side requests identify themselves with a shared secret so the API's
// per-IP rate limit doesn't treat all Vercel traffic as one client. The key is
// a server-only env var (no NEXT_PUBLIC_ prefix), so it never reaches browsers.
function internalHeaders() {
  const key = typeof window === "undefined" ? process.env.INTERNAL_API_KEY : null;
  return key ? { "X-Internal-Key": key } : {};
}

/**
 * @param {string} path
 * @param {{ tags?: string[], revalidate?: number }} [cache] - pass tags to
 *   cache a server-side read; omit for an uncached (no-store) request.
 */
async function apiGet(path, cache) {
  const init = { headers: internalHeaders(), signal: AbortSignal.timeout(10000) };
  if (cache?.tags && typeof window === "undefined") {
    init.next = { revalidate: cache.revalidate ?? CATALOG_REVALIDATE, tags: cache.tags };
  } else {
    init.cache = "no-store";
  }
  return fetchWithRetry(`${API_BASE_URL}${path}`, init);
}

/**
 * Fetch a single product by slug, server-side.
 * @returns {Promise<object|null>} the product, or null if not found.
 */
export async function getProductBySlug(slug) {
  // Anything that isn't slug-shaped can't be a product; skip the API call.
  if (!isSlug(slug)) return null;
  const res = await apiGet(`/products/${encodeURIComponent(slug)}`, {
    tags: ["products", `product:${slug}`, "categories", "brands"],
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch product "${slug}": ${res.status}`);
  const json = await res.json();
  return json?.data ?? null;
}

/**
 * Fetch a paginated product list with optional filters.
 * @param {Record<string,string|number>} params - e.g. { page, limit, category, brand, condition }
 * @param {{ revalidate?: number }} [opts]
 * @returns {Promise<{ data: object[], pagination: object|null }>}
 */
export async function getProducts(params = {}, opts = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const res = await apiGet(`/products?${qs.toString()}`, {
    tags: ["products", "brands", "categories"],
    revalidate: opts.revalidate,
  });
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  const json = await res.json();
  return { data: json?.data ?? [], pagination: json?.pagination ?? null };
}

/**
 * Fetch featured products (home page, llms.txt).
 * @param {{ limit?: number, revalidate?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getFeaturedProducts({ limit, revalidate } = {}) {
  const qs = limit ? `?limit=${Number(limit)}` : "";
  const res = await apiGet(`/products/featured${qs}`, { tags: ["products", "brands"], revalidate });
  if (!res.ok) throw new Error(`Failed to fetch featured products: ${res.status}`);
  const json = await res.json();
  return json?.data ?? [];
}

/**
 * Fetch the active variants for a product. Used by the cart to check live
 * stock and price, so it is never cached.
 * @returns {Promise<object[]>} [{ id, sku, variant_name, color, price, compare_at_price }]
 */
export async function getVariants(productId) {
  const res = await apiGet(`/products/${productId}/variants`);
  if (!res.ok) throw new Error(`Failed to fetch variants: ${res.status}`);
  const json = await res.json();
  return json?.data ?? [];
}

/**
 * Search products by query (trigram fuzzy search on the backend). Not cached:
 * the query space is unbounded and search pages are noindex anyway.
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
