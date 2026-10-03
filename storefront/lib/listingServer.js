import "server-only";
import { getBrands, getCategories } from "@/lib/api/server";
import { pageMetadata, isSlug } from "@/lib/seo";
import { listingHref } from "@/lib/listing";

/** Filter facets for the listing UI: categories flattened (children indented) and brands, with counts. */
export async function getFacets() {
  const [categories, brands] = await Promise.all([getCategories(), getBrands()]);
  const flat = [];
  const active = (categories || []).filter((c) => c.is_active !== false);
  const kids = (id) => active.filter((c) => c.parent_id === id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const walk = (c, depth) => {
    if (Number(c.product_count ?? 1) > 0) flat.push({ slug: c.slug, name: c.name, count: Number(c.product_count) || 0, depth });
    kids(c.id).forEach((k) => walk(k, depth + 1));
  };
  active.filter((c) => !c.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach((c) => walk(c, 0));
  return {
    rawCategories: categories,
    rawBrands: brands,
    categories: flat,
    brands: (brands || []).filter((b) => b.is_active !== false && Number(b.product_count ?? 1) > 0).map((b) => ({ slug: b.slug, name: b.name, count: Number(b.product_count) || 0 })),
  };
}

/**
 * Metadata for a listing route. `canonical` is the params that define the
 * indexable page (e.g. { condition: "used" }); any other active filter, or a
 * deep page, stays crawlable but unindexed.
 */
export function listingMetadata({ title, description, basePath, params, canonical = {}, images }) {
  const keys = ["category", "brand", "condition", "min_price", "max_price", "instock", "sort"];
  const extra = keys.some((k) => params[k] !== undefined && params[k] !== canonical[k]);
  return pageMetadata({
    title: params.page > 1 ? `${title} - Page ${params.page}` : title,
    description,
    path: listingHref(basePath, { ...canonical, page: params.page }),
    images,
    noindex: extra || params.page > 1,
  });
}

export { isSlug };
