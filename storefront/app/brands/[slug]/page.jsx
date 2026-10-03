import { notFound } from "next/navigation";
import ListingPage from "@/components/listing/ListingPage";
import { fetchListing, parseListingParams } from "@/lib/listing";
import { getFacets, listingMetadata } from "@/lib/listingServer";
import { isSlug, safeUrl } from "@/lib/seo";

export const revalidate = 300;

async function load(slug, raw) {
  if (!isSlug(slug)) return null;
  const facets = await getFacets();
  const brand = facets.rawBrands?.find((b) => b.slug === slug);
  if (facets.rawBrands && !brand) return null;
  return { facets, brand, params: parseListingParams({ ...raw, brand: undefined }) };
}

export async function generateMetadata({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) return { title: "Brand not found", robots: { index: false, follow: true } };
  const { brand: b, params } = ctx;
  const name = b?.name || slug;
  return listingMetadata({
    title: b?.meta_title || `${name} Price in Bangladesh`,
    description:
      b?.meta_description ||
      `${b?.description ? `${b.description.trim()} ` : ""}Buy ${name} laptops and gadgets at Premium Gadget, Chattogram. New and used, with warranty and cash on delivery across Bangladesh.`,
    basePath: `/brands/${slug}`,
    params,
  });
}

export default async function BrandPage({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) notFound();
  const { facets, brand, params } = ctx;
  const { products, pagination, failed } = await fetchListing({ ...params, brand: slug });
  const name = brand?.name || slug;

  return (
    <ListingPage
      basePath={`/brands/${slug}`}
      params={params}
      heading={name}
      eyebrow="Brand"
      description={brand?.description || `${name} laptops and gadgets, new and pre-owned, with warranty. Pick up at our GEC or WASA branch in Chattogram, or get it delivered.`}
      bannerUrl={safeUrl(brand?.banner_url)}
      breadcrumbs={[{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name, path: `/brands/${slug}` }]}
      products={products}
      pagination={pagination}
      failed={failed}
      facets={facets}
      hide={{ brand: true }}
    />
  );
}
