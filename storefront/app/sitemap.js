import { getAllProducts, getLiveCollections, getBrands, getCategories, getMenu, getProductSitemap } from "@/lib/api/server";
import { absoluteUrl, isSlug, safeUrl, xmlEscape } from "@/lib/seo";

// Rebuilt hourly (or when the backend revalidates `products` / `categories` /
// `brands`). If the API is down, the static pages are still listed.
export const revalidate = 3600;
const HOURLY = { revalidate: 3600 };

// Next writes <loc>/<image:loc> verbatim, so URLs are XML-escaped here
// (image URLs routinely contain "&").
const loc = (path) => xmlEscape(absoluteUrl(path));

const toDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};

/** Product slugs + lastmod + image: GET /products/sitemap, else page through GET /products. */
async function loadProducts() {
  const rows = (await getProductSitemap(HOURLY)) || (await getAllProducts(HOURLY)) || [];
  return rows
    .filter((p) => isSlug(p?.slug))
    .map((p) => ({ slug: p.slug, updatedAt: toDate(p.updated_at), image: safeUrl(p.image) }));
}

const latest = (dates) => {
  const ts = dates.filter(Boolean).map((d) => d.getTime());
  return ts.length ? new Date(Math.max(...ts)) : undefined;
};

export default async function sitemap() {
  const [products, categories, brands, collections, menu] = await Promise.all([
    loadProducts(),
    getCategories(HOURLY),
    getBrands(HOURLY),
    getLiveCollections(),
    getMenu().catch(() => null),
  ]);
  const catalogUpdated = latest(products.map((p) => p.updatedAt));

  const entries = [
    { url: loc("/"), lastModified: catalogUpdated, changeFrequency: "daily", priority: 1 },
    { url: loc("/products"), lastModified: catalogUpdated, changeFrequency: "daily", priority: 0.9 },
    { url: loc("/products?condition=used"), changeFrequency: "daily", priority: 0.8 },
    { url: loc("/products?condition=new"), changeFrequency: "daily", priority: 0.7 },
    { url: loc("/repairs"), changeFrequency: "monthly", priority: 0.6 },
  ];

  // Listing pages only for categories/brands that have products (empty ones are thin).
  (categories || [])
    .filter((c) => isSlug(c.slug) && c.is_active !== false && Number(c.product_count ?? 1) > 0)
    .forEach((c) =>
      entries.push({
        url: loc(`/categories/${c.slug}`),
        lastModified: toDate(c.updated_at),
        changeFrequency: "daily",
        priority: 0.8,
      })
    );
  // "Used laptops" / "New laptops" landing pages: top-level categories that stock more than one condition.
  (menu?.categories || [])
    .filter((c) => isSlug(c.slug) && (c.conditions?.length || 0) > 1)
    .forEach((c) =>
      c.conditions.forEach((k) =>
        entries.push({ url: loc(`/categories/${c.slug}?condition=${encodeURIComponent(k.code)}`), changeFrequency: "daily", priority: 0.7 })
      )
    );
  (brands || [])
    .filter((b) => isSlug(b.slug) && b.is_active !== false && Number(b.product_count ?? 1) > 0)
    .forEach((b) =>
      entries.push({
        url: loc(`/brands/${b.slug}`),
        lastModified: toDate(b.updated_at),
        changeFrequency: "weekly",
        priority: 0.6,
      })
    );

  collections
    .filter((c) => isSlug(c.slug))
    .forEach((c) => entries.push({ url: loc(`/collections/${c.slug}`), changeFrequency: "daily", priority: 0.6 }));

  products.forEach((p) =>
    entries.push({
      url: loc(`/products/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
      ...(p.image ? { images: [xmlEscape(absoluteUrl(p.image))] } : {}),
    })
  );

  // Drop undefined lastModified so Next doesn't print an empty <lastmod>.
  return entries.map((e) => (e.lastModified ? e : (({ lastModified, ...rest }) => rest)(e)));
}
