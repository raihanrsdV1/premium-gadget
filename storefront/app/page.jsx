import { getFeaturedProducts } from "@/lib/api/products";
import { getBanners, getBrandList, getHomeCollections, getMenu, getSettings } from "@/lib/api/server";
import ProductCard from "@/components/product/ProductCard";
import HeroSlider from "@/components/home/HeroSlider";
import CollectionSection from "@/components/home/CollectionSection";
import CategoryTiles from "@/components/home/CategoryTiles";
import PromoGrid from "@/components/home/PromoGrid";
import BrandStrip from "@/components/home/BrandStrip";
import TrustRow from "@/components/home/TrustRow";
import ConditionTeaser from "@/components/home/ConditionTeaser";
import RepairsCTA from "@/components/home/RepairsCTA";
import SeoText from "@/components/home/SeoText";
import { toBannerSlides } from "@/lib/banners";
import { DEFAULT_DESCRIPTION, absoluteUrl, pageMetadata, safeUrl } from "@/lib/seo";

// Static page, regenerated every 5 minutes or when the backend revalidates
// the `products` / `banners` / `settings` / `collections` tags.
export const revalidate = 300;

export async function generateMetadata() {
  const seo = (await getSettings())?.seo || {};
  const ogImage = safeUrl(seo.og_image);
  return pageMetadata({
    title: { absolute: seo.default_title || "Premium Gadget — New & Used Laptops in Chattogram, Bangladesh" },
    description: seo.default_description || DEFAULT_DESCRIPTION,
    path: "/",
    images: ogImage ? [{ url: absoluteUrl(ogImage) }] : undefined,
  });
}

export default async function HomePage() {
  const [collections, heroBanners, promoBanners, menu, brands] = await Promise.all([
    getHomeCollections(),
    getBanners("hero"),
    getBanners("promo"),
    getMenu(),
    getBrandList(),
  ]);
  // Collections endpoint missing or empty: fall back to featured products.
  const featured = collections.some((c) => c.products?.length)
    ? []
    : await getFeaturedProducts().catch(() => []);
  const slides = toBannerSlides(heroBanners);
  const promos = toBannerSlides(promoBanners);
  const sections = collections.filter((c) => c.products?.length);

  return (
    <div className="flex flex-col gap-12 pb-4 sm:gap-16">
      <div className="-mb-4 sm:-mb-6">
        <HeroSlider slides={slides} />
      </div>
      <CategoryTiles categories={menu?.categories || []} />

      {sections.map((c, i) => (
        <div key={c.id || c.slug} className="contents">
          <CollectionSection collection={c} firstRow={i === 0} />
          {i === 1 && <PromoGrid banners={promos} />}
        </div>
      ))}
      {sections.length < 2 && <PromoGrid banners={promos} />}

      {featured.length > 0 && (
        <section aria-labelledby="home-featured" className="container">
          <h2 id="home-featured" className="text-title mb-4 sm:mb-6">Featured products</h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        </section>
      )}

      <BrandStrip brands={brands} />
      <ConditionTeaser />
      <TrustRow />
      <RepairsCTA />
      <SeoText />
    </div>
  );
}
