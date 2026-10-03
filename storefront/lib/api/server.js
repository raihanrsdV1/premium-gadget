import "server-only";
import { CATALOG_REVALIDATE } from "@/lib/api/products";
import { fetchWithRetry } from "@/lib/api/retry";

// Server-only catalog reads for metadata, structured data, the sitemap and the
// agent feeds. Every read is cached in Next's Data Cache under a tag the
// backend revalidates on write (see app/api/revalidate), and every helper
// degrades to null / [] instead of throwing: a missing endpoint or a down API
// must never break a page, only drop the section that needed the data.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1";

function internalHeaders() {
  const key = process.env.INTERNAL_API_KEY;
  return key ? { "X-Internal-Key": key } : {};
}

/**
 * Cached GET returning the parsed `{ success, data, ... }` envelope, or null
 * on any failure (network, timeout, 404 for an endpoint not deployed yet, …).
 */
async function cachedGet(path, { tags, revalidate = CATALOG_REVALIDATE }) {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      headers: internalHeaders(),
      next: { revalidate, tags },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** @returns {Promise<object[]|null>} active categories (flat, with parent_id), or null if unavailable. */
export async function getCategories({ revalidate } = {}) {
  const json = await cachedGet("/categories", { tags: ["categories"], revalidate });
  return Array.isArray(json?.data) ? json.data : null;
}

/** @returns {Promise<object[]|null>} active brands, or null if unavailable. */
export async function getBrands({ revalidate } = {}) {
  const json = await cachedGet("/brands", { tags: ["brands"], revalidate });
  return Array.isArray(json?.data) ? json.data : null;
}

/** @returns {Promise<object|null>} public store settings (contact, shipping zones, checkout, seo). */
export async function getSettings({ revalidate } = {}) {
  const json = await cachedGet("/settings", { tags: ["settings"], revalidate });
  return json?.data && typeof json.data === "object" ? json.data : null;
}

/**
 * Admin-curated banners for a placement. Product slides carry live prices,
 * so they are also tagged `products`.
 * @returns {Promise<object[]>} [] when there are none or the endpoint is unavailable.
 */
export async function getBanners(placement = "hero") {
  const json = await cachedGet(`/banners?placement=${encodeURIComponent(placement)}`, {
    tags: ["banners", "products"],
  });
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * Approved reviews (newest first) and the rating summary for a product.
 * @returns {Promise<{ reviews: object[], summary: { average: number, count: number } }|null>}
 */
export async function getReviews(productId, slug) {
  const json = await cachedGet(
    `/reviews?product_id=${encodeURIComponent(productId)}&limit=10`,
    { tags: ["reviews", "products", `product:${slug}`] }
  );
  if (!json || !Array.isArray(json.data)) return null;
  return { reviews: json.data, summary: json.summary || { average: 0, count: 0 } };
}

/** `[{ slug, updated_at, image }]` for every active product, or null if the endpoint is unavailable. */
export async function getProductSitemap({ revalidate } = {}) {
  const json = await cachedGet("/products/sitemap", { tags: ["products"], revalidate });
  return Array.isArray(json?.data) ? json.data : null;
}

/**
 * Every public product row (list shape), paging through GET /products.
 * @param {{ params?: Record<string,string>, revalidate?: number, maxPages?: number }} [opts]
 * @returns {Promise<object[]|null>} null if the first page fails.
 */
export async function getAllProducts({ params = {}, revalidate, maxPages = 50 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const qs = new URLSearchParams({ ...params, page: String(page), limit: "100" });
    const json = await cachedGet(`/products?${qs.toString()}`, {
      tags: ["products", "brands", "categories"],
      revalidate,
    });
    if (!Array.isArray(json?.data)) return page === 1 ? null : rows;
    rows.push(...json.data);
    if (!json.pagination?.hasNext) break;
  }
  return rows;
}

/**
 * Storefront navigation: top-level categories with sub-categories and brands.
 * GET /catalog/menu; until that endpoint exists it is built from /categories
 * (tree by parent_id). Brands aren't per-category there, so `brands` stays empty.
 * @returns {Promise<{ categories: object[] }|null>}
 */
export async function getMenu() {
  const json = await cachedGet("/catalog/menu", { tags: ["categories", "brands", "products"] });
  if (Array.isArray(json?.data?.categories)) return json.data;
  const cats = await getCategories();
  if (!cats) return null;
  const top = cats.filter((c) => !c.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    categories: top.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image_url: c.icon_url || c.banner_url || null,
      children: cats
        .filter((k) => k.parent_id === c.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((k) => ({ name: k.name, slug: k.slug })),
      brands: [],
    })),
  };
}

/** Live collections flagged for the home page, each with its products. [] if unavailable. */
export async function getHomeCollections() {
  const json = await cachedGet("/collections?home=true", { tags: ["collections", "products", "brands"], revalidate: 60 });
  return Array.isArray(json?.data) ? json.data : [];
}

/** Active brands for the home brand strip; [] if unavailable. */
export async function getBrandList() {
  return (await getBrands()) || [];
}

/** Live collections (no products), for the sitemap and links; [] if unavailable. */
export async function getLiveCollections() {
  const json = await cachedGet("/collections", { tags: ["collections"], revalidate: 300 });
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * One live collection with a page of products: { collection, products, pagination }.
 * null when the collection isn't live (404) or the API is unavailable.
 */
export async function getCollection(slug, { page = 1, limit = 12, sort } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (sort) qs.set("sort", sort);
  const json = await cachedGet(`/collections/${encodeURIComponent(slug)}?${qs}`, {
    tags: ["collections", "products", "brands", `collection:${slug}`],
    revalidate: 60,
  });
  if (!json?.data?.collection) return null;
  return { collection: json.data.collection, products: json.data.products || [], pagination: json.pagination || null };
}

/** Public repair services [{ id, name, slug, description, base_price }]; null if unavailable. */
export async function getRepairServices() {
  const json = await cachedGet("/repairs/services", { tags: ["repairs"], revalidate: 300 });
  return Array.isArray(json?.data) && json.data.length ? json.data : null;
}
