import { notFound } from "next/navigation";
import ListingPage from "@/components/listing/ListingPage";
import { CONDITION_LABELS, conditionTitle, fetchListing, parseListingParams } from "@/lib/listing";
import { getFacets, listingMetadata } from "@/lib/listingServer";
import { getMenu } from "@/lib/api/server";
import { categoryTrail, isSlug, safeUrl } from "@/lib/seo";

export const revalidate = 300;

async function load(slug, raw) {
  if (!isSlug(slug)) return null;
  const facets = await getFacets();
  const category = facets.rawCategories?.find((c) => c.slug === slug);
  // If the category list is unavailable we can't tell; render the page rather than 404 a real URL.
  if (facets.rawCategories && !category) return null;
  const params = parseListingParams({ ...raw, category: undefined });
  return { facets, category, params };
}

/** True when `condition` is the only filter, i.e. the indexable "Used laptops" landing page. */
const onlyCondition = (params) =>
  Boolean(params.condition) && !params.brand && !params.min_price && !params.max_price && !params.instock && !params.sort;

const CONDITION_BLURB = {
  used: "tested, graded and sold with shop warranty and a condition report",
  new: "brand-new and sealed, with official brand warranty",
  refurbished: "professionally refurbished and warrantied",
  open_box: "open-box units at a lower price, fully checked",
};

/** Condition tabs (All / New / Used) for a top-level category, from GET /catalog/menu. */
async function conditionTabsFor(slug) {
  const menu = await getMenu();
  const top = menu?.categories?.find((c) => c.slug === slug);
  return (top?.conditions || []).map((k) => ({ code: k.code, label: CONDITION_LABELS[k.code] || k.label, count: k.count }));
}

export async function generateMetadata({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) return { title: "Category not found", robots: { index: false, follow: true } };
  const { category: c, params } = ctx;
  const name = c?.name || slug;
  if (params.condition) {
    const t = conditionTitle(params.condition, name);
    return listingMetadata({
      title: `${t} in Chattogram - Price in Bangladesh`,
      description: `Buy ${t.toLowerCase()} in Chattogram: ${CONDITION_BLURB[params.condition]}. Premium Gadget, GEC & WASA branches, cash on delivery across Bangladesh.`,
      basePath: `/categories/${slug}`,
      params,
      canonical: onlyCondition(params) ? { condition: params.condition } : {},
    });
  }
  return listingMetadata({
    title: c?.meta_title || `${name} Price in Bangladesh`,
    description:
      c?.meta_description ||
      `${c?.description ? `${c.description.trim()} ` : ""}Buy ${name} at Premium Gadget, Chattogram. GEC & WASA branches, warranty, cash on delivery across Bangladesh.`,
    basePath: `/categories/${slug}`,
    params,
  });
}

export default async function CategoryPage({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) notFound();
  const { facets, category, params } = ctx;
  const { products, pagination, failed } = await fetchListing({ ...params, category: slug });

  const trail = categoryTrail(facets.rawCategories, slug);
  const children = (facets.rawCategories || [])
    .filter((c) => c.parent_id === category?.id && c.is_active !== false && Number(c.product_count ?? 1) > 0)
    .map((c) => ({ name: c.name, slug: c.slug, href: `/categories/${c.slug}` }));
  const name = category?.name || slug;
  const conditionTabs = await conditionTabsFor(slug);
  const cond = params.condition;
  const condName = cond ? conditionTitle(cond, name) : null;

  return (
    <ListingPage
      basePath={`/categories/${slug}`}
      params={params}
      heading={condName ? `${condName} in Chattogram` : name}
      eyebrow="Category"
      conditionTabs={conditionTabs}
      description={condName ? `Shop ${condName.toLowerCase()} at Premium Gadget: ${CONDITION_BLURB[cond]}. GEC and WASA branches in Chattogram, delivery across Bangladesh.` : category?.description || `Shop ${name} at Premium Gadget. Warranty on every device, GEC and WASA branches in Chattogram, delivery across Bangladesh.`}
      bannerUrl={safeUrl(category?.banner_url)}
      breadcrumbs={[
        { name: "Home", path: "/" },
        ...(trail.length ? trail : [{ name, slug }]).map((c) => ({ name: c.name, path: `/categories/${c.slug}` })),
      ]}
      products={products}
      pagination={pagination}
      failed={failed}
      facets={facets}
      hide={{ category: true }}
      subLinks={children}
    />
  );
}
