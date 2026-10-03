import { notFound } from "next/navigation";
import { Zap } from "lucide-react";
import ListingPage from "@/components/listing/ListingPage";
import Countdown from "@/components/home/Countdown";
import { getCollection } from "@/lib/api/server";
import { PAGE_SIZE, parseListingParams } from "@/lib/listing";
import { listingMetadata } from "@/lib/listingServer";
import { isSlug, safeUrl } from "@/lib/seo";

export const revalidate = 60;

// The collection endpoint supports these sorts only.
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

const load = async (slug, raw) => {
  if (!isSlug(slug)) return null;
  const params = parseListingParams(raw);
  if (params.sort === "name") params.sort = undefined;
  const data = await getCollection(slug, { page: params.page, limit: PAGE_SIZE, sort: params.sort });
  return data ? { ...data, params } : null;
};

export async function generateMetadata({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) return { title: "Collection not found", robots: { index: false, follow: true } };
  const { collection: c, params } = ctx;
  return listingMetadata({
    title: c.meta_title || c.name,
    description: c.meta_description || c.description || `${c.name} at Premium Gadget, Chattogram. Warranty on every device, cash on delivery across Bangladesh.`,
    basePath: `/collections/${slug}`,
    // Only paging and sort matter on a collection.
    params: { page: params.page, sort: params.sort },
    images: safeUrl(c.banner_url) ? [{ url: safeUrl(c.banner_url), alt: c.name }] : undefined,
  });
}

export default async function CollectionPage({ params: route, searchParams }) {
  const { slug } = await route;
  const ctx = await load(slug, await searchParams);
  if (!ctx) notFound();
  const { collection: c, products, pagination, params } = ctx;
  // Collections only use paging and sort; other params are ignored.
  const colParams = { page: params.page, sort: params.sort };

  return (
    <ListingPage
      basePath={`/collections/${slug}`}
      params={colParams}
      heading={c.name}
      eyebrow={c.badge_label || "Collection"}
      description={c.description}
      bannerUrl={safeUrl(c.banner_url)}
      headerExtra={
        c.ends_at ? (
          <div className="mt-1 flex items-center gap-3 text-white">
            <Zap className="h-5 w-5 fill-coral text-coral" aria-hidden="true" />
            <Countdown endsAt={c.ends_at} onDark />
          </div>
        ) : null
      }
      breadcrumbs={[{ name: "Home", path: "/" }, { name: c.name, path: `/collections/${slug}` }]}
      products={products}
      pagination={pagination}
      failed={false}
      showFilters={false}
      sortOptions={SORTS}
    />
  );
}
