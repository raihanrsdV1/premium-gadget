import { getAllProducts, getCategories } from "@/lib/api/server";
import { SITE, branchAddressLine } from "@/lib/site";
import { SITE_URL, absoluteUrl, conditionOf, highlightsOf, isSlug, safeUrl, toNumber } from "@/lib/seo";

/**
 * /products.json — a compact public product feed for AI agents and
 * comparison tools. Built only from public API fields through an explicit
 * whitelist (never a spread), so internal fields such as cost price can't
 * leak even if an API response ever carried them.
 *
 * Rendered per request from Data-Cache reads (1 hour, `products` tag), so an
 * API outage returns 503 instead of caching an empty catalog.
 */
const HOURLY = { revalidate: 3600 };

/**
 * List rows don't carry the category yet, so map product → category by
 * listing each category, deepest first (the API's category filter includes
 * descendants, so the first match is the product's own category).
 */
async function categoryByProduct(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const depth = (c) => {
    let d = 0;
    for (let n = c; n?.parent_id && d < 10; n = byId.get(n.parent_id)) d += 1;
    return d;
  };
  const ordered = categories
    .filter((c) => isSlug(c.slug) && Number(c.product_count ?? 1) > 0)
    .sort((a, b) => depth(b) - depth(a))
    .slice(0, 100);
  const lists = await Promise.all(
    ordered.map((c) => getAllProducts({ params: { category: c.slug }, ...HOURLY, maxPages: 20 }))
  );
  const map = new Map();
  ordered.forEach((c, i) => (lists[i] || []).forEach((p) => {
    if (!map.has(p.id)) map.set(p.id, c.name);
  }));
  return map;
}

export async function GET() {
  const rows = await getAllProducts(HOURLY);
  if (!rows) {
    return Response.json(
      { error: "Catalog temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } }
    );
  }

  const needsCategories = rows.some((p) => !p.category);
  const categories = needsCategories ? await getCategories(HOURLY) : null;
  const categoryOf = categories ? await categoryByProduct(categories) : new Map();

  const products = rows
    .filter((p) => isSlug(p?.slug))
    .map((p) => {
      const cond = conditionOf(p);
      const image = safeUrl(p.image);
      const compareAt = toNumber(p.compare_at_price);
      const price = toNumber(p.price);
      return {
        name: p.name,
        url: absoluteUrl(`/products/${p.slug}`),
        price,
        compare_at_price: compareAt !== null && price !== null && compareAt > price ? compareAt : null,
        currency: "BDT",
        availability: p.in_stock ? "in_stock" : "out_of_stock",
        condition: cond.code,
        condition_grade: p.condition_grade || null,
        brand: p.brand || null,
        category: p.category || categoryOf.get(p.id) || null,
        highlights: highlightsOf(p),
        warranty_months: toNumber(p.warranty_months),
        image: image ? absoluteUrl(image) : null,
        updated_at: p.updated_at || null,
      };
    });

  const body = {
    store: {
      name: SITE.name,
      url: `${SITE_URL}/`,
      phone: SITE.phoneE164,
      whatsapp: SITE.whatsappUrl,
      country: "BD",
      currency: "BDT",
      branches: SITE.branches.map((b) => ({ name: b.name, address: branchAddressLine(b) })),
    },
    generated_at: new Date().toISOString(),
    count: products.length,
    products,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
