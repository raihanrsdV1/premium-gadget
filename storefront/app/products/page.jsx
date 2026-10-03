import { permanentRedirect } from "next/navigation";
import ListingPage from "@/components/listing/ListingPage";
import { fetchListing, listingHref, parseListingParams } from "@/lib/listing";
import { getFacets, listingMetadata } from "@/lib/listingServer";

const CONDITION_TITLES = { used: "Used Laptops & Gadgets", new: "New Laptops & Gadgets" };
const DEFAULT_DESCRIPTION =
  "Shop new and tested used laptops, MacBooks, accessories and gadgets at Premium Gadget, Chattogram. Warranty on every device, GEC & WASA branches, cash on delivery across Bangladesh.";

/**
 * Old `?category=` / `?brand=` URLs (bookmarks, search engines) now live at
 * /categories/[slug] and /brands/[slug]; known slugs are redirected there with
 * the remaining filters kept. Unknown slugs fall through to an empty listing.
 */
async function redirectLegacy(params) {
  if (!params.category && !params.brand) return;
  const facets = await getFacets();
  if (params.category && facets.rawCategories?.some((c) => c.slug === params.category)) {
    permanentRedirect(listingHref(`/categories/${params.category}`, { ...params, category: undefined }));
  }
  if (!params.category && params.brand && facets.rawBrands?.some((b) => b.slug === params.brand)) {
    permanentRedirect(listingHref(`/brands/${params.brand}`, { ...params, brand: undefined }));
  }
}

export async function generateMetadata({ searchParams }) {
  const params = parseListingParams(await searchParams);
  const onlyCondition = params.condition && !params.category && !params.brand;
  return listingMetadata({
    title: onlyCondition ? `${CONDITION_TITLES[params.condition]} Price in Bangladesh` : "Laptops & Gadgets Price in Bangladesh",
    description: onlyCondition
      ? params.condition === "used"
        ? "Tested, graded used laptops and gadgets with shop warranty and battery health listed. Premium Gadget, Chattogram. GEC & WASA branches, cash on delivery across Bangladesh."
        : "Brand-new laptops, MacBooks and accessories with warranty at Premium Gadget, Chattogram. GEC & WASA branches, cash on delivery across Bangladesh."
      : DEFAULT_DESCRIPTION,
    basePath: "/products",
    params,
    // ?condition=used|new alone are indexable landing pages (listed in the sitemap).
    canonical: onlyCondition ? { condition: params.condition } : {},
  });
}

export default async function ProductListPage({ searchParams }) {
  const params = parseListingParams(await searchParams);
  await redirectLegacy(params);
  const [facets, { products, pagination, failed }] = await Promise.all([getFacets(), fetchListing(params)]);

  const heading =
    params.condition === "used" && !params.category && !params.brand ? "Pre-owned laptops & gadgets"
    : params.condition === "new" && !params.category && !params.brand ? "New laptops & gadgets"
    : "All products";

  return (
    <ListingPage
      basePath="/products"
      params={params}
      heading={heading}
      eyebrow="Shop"
      description={params.condition === "used" ? "Every pre-owned device is tested by our technicians, graded, and sold with warranty." : "New and tested pre-owned laptops, MacBooks and gadgets from our GEC and WASA branches."}
      breadcrumbs={[{ name: "Home", path: "/" }, { name: "Products", path: "/products" }]}
      products={products}
      pagination={pagination}
      failed={failed}
      facets={facets}
    />
  );
}
