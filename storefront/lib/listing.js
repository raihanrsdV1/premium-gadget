import { getProducts } from "@/lib/api/products";

export const PAGE_SIZE = 12;

/** Product condition codes the listing accepts (the API's enum), with shopper-facing labels. */
export const CONDITION_CODES = ["new", "used", "refurbished", "open_box"];
export const CONDITION_LABELS = { new: "New", used: "Used", refurbished: "Refurbished", open_box: "Open box" };

/** "Used" + "Laptops" -> "Used laptops" (category names are lower-cased after the condition). */
export function conditionTitle(code, categoryName) {
  const label = CONDITION_LABELS[code] || code;
  return categoryName ? `${label} ${String(categoryName).toLowerCase()}` : label;
}

/** Link to a top-level category filtered by condition. */
export function conditionHref(categorySlug, code) {
  return `/categories/${encodeURIComponent(categorySlug)}?condition=${encodeURIComponent(code)}`;
}

export const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name (A-Z)" },
];
const SORT_VALUES = SORTS.map((s) => s.value);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugOf = (v) => (typeof v === "string" && v.length <= 60 && SLUG_RE.test(v) ? v : undefined);
const intOf = (v, max = 999999999) => {
  const n = Number.parseInt(typeof v === "string" ? v : "", 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};

/**
 * Whitelist and normalise listing query params. Anything unexpected
 * (arrays, markup, overlong strings) is dropped before it reaches the API,
 * metadata or JSON-LD.
 */
export function parseListingParams(raw = {}) {
  const page = intOf(raw.page, 9999);
  let min = intOf(raw.min_price);
  let max = intOf(raw.max_price);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return {
    page: page && page > 0 ? page : 1,
    category: slugOf(raw.category),
    brand: slugOf(raw.brand),
    condition: CONDITION_CODES.includes(raw.condition) ? raw.condition : undefined,
    min_price: min,
    max_price: max,
    instock: raw.instock === "1" ? "1" : undefined,
    sort: SORT_VALUES.includes(raw.sort) && raw.sort !== "newest" ? raw.sort : undefined,
  };
}

/** Query string for the listing params (fixed order, only set values). */
export function listingQuery(p, overrides = {}) {
  const v = { ...p, ...overrides };
  const qs = new URLSearchParams();
  ["category", "brand", "condition", "min_price", "max_price", "instock", "sort"].forEach((k) => {
    if (v[k] !== undefined && v[k] !== null && v[k] !== "") qs.set(k, String(v[k]));
  });
  if (v.page > 1) qs.set("page", String(v.page));
  return qs.toString();
}

export function listingHref(basePath, p, overrides) {
  const qs = listingQuery(p, overrides);
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Fetch one page of a listing (all filters, in-stock included, run on the API).
 * @returns {Promise<{ products: object[], pagination: object|null, failed: boolean }>}
 */
export async function fetchListing(p) {
  const query = {
    ...(p.category && { category: p.category }),
    ...(p.brand && { brand: p.brand }),
    ...(p.condition && { condition: p.condition }),
    ...(p.min_price !== undefined && { min_price: p.min_price }),
    ...(p.max_price !== undefined && { max_price: p.max_price }),
    ...(p.instock && { in_stock: "true" }),
    ...(p.sort && { sort: p.sort }),
  };
  try {
    const r = await getProducts({ ...query, page: p.page, limit: PAGE_SIZE });
    return { products: r.data, pagination: r.pagination, failed: false };
  } catch {
    return { products: [], pagination: null, failed: true };
  }
}
