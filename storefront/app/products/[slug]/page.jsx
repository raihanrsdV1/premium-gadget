import { notFound } from "next/navigation";
import { getProductBySlug, getProducts } from "@/lib/api/products";
import { getCategories, getReviews, getSettings } from "@/lib/api/server";
import ProductDetailView from "@/components/ProductDetailView";
import ProductSpecs from "@/components/product/ProductSpecs";
import ConditionReport from "@/components/product/ConditionReport";
import DeliveryInfo from "@/components/product/DeliveryInfo";
import ProductCard from "@/components/product/ProductCard";
import ProductCarousel from "@/components/home/ProductCarousel";
import JsonLd from "@/components/seo/JsonLd";
import { renderMarkdown, markdownToText } from "@/lib/markdown";
import {
  absoluteUrl,
  categoryTrail,
  highlightsOf,
  pageMetadata,
  productDescription,
  safeUrl,
  specGroupsOf,
} from "@/lib/seo";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/structuredData";

// Product pages are rendered on first visit and then served from cache
// (ISR): data refreshes every 5 minutes, or immediately when the backend
// revalidates the `product:<slug>` / `products` tags after an admin edit.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

const codEnabled = (settings) => settings?.checkout?.cod_enabled !== false;

/** OG image: the admin's override, else the primary product image. */
function primaryImage(product) {
  const primary = product.image_list?.find((i) => i.is_primary) || product.image_list?.[0];
  const url = safeUrl(product.og_image_url) || safeUrl(primary?.url) || safeUrl(product.images?.[0]);
  if (!url) return null;
  return { url: absoluteUrl(url), alt: primary?.alt_text || product.name };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), getSettings()]);

  if (!product) {
    return { title: "Product Not Found", robots: { index: false, follow: true } };
  }

  const metaTitle = product.meta_title?.trim();
  // A custom title that already names the shop shouldn't get the suffix twice.
  const title = metaTitle
    ? /premium gadget/i.test(metaTitle) ? { absolute: metaTitle } : metaTitle
    : `${product.name} Price in Bangladesh`;
  const image = primaryImage(product);

  return pageMetadata({
    title,
    description: productDescription(product, { cod: codEnabled(settings) }),
    path: `/products/${product.slug}`,
    images: image ? [image] : undefined,
  });
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [settings, categories, reviews, relatedRows] = await Promise.all([
    getSettings(),
    getCategories(),
    getReviews(product.id, product.slug),
    product.category_slug
      ? getProducts({ category: product.category_slug, limit: 9 }).then((r) => r.data).catch(() => [])
      : Promise.resolve([]),
  ]);
  const related = relatedRows.filter((p) => p.id !== product.id).slice(0, 8);
  const fees = (settings?.shipping?.zones || []).map((z) => Number(z.fee)).filter((n) => Number.isFinite(n));

  const url = absoluteUrl(`/products/${product.slug}`);
  const trail = categoryTrail(categories, product.category_slug);
  if (!trail.length && product.category && product.category_slug) {
    trail.push({ name: product.category, slug: product.category_slug });
  }

  const overviewText = markdownToText(product.description_md || product.description || "");
  const description =
    [product.short_description, overviewText].filter(Boolean).join("\n").slice(0, 5000) ||
    productDescription(product, { cod: codEnabled(settings) });

  const productLd = productJsonLd(product, {
    url,
    description,
    settings,
    reviews,
    categoryPath: trail.length ? trail.map((c) => c.name).join(" > ") : null,
  });
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    ...trail.map((c) => ({ name: c.name, path: `/categories/${c.slug}` })),
    { name: product.name, path: `/products/${product.slug}` },
  ]);

  const specGroups = specGroupsOf(product);
  const overview = renderMarkdown(product.description_md || product.description || "");

  return (
    <>
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />
      <ProductDetailView
        product={product}
        highlights={highlightsOf(product)}
        breadcrumbs={[
          { name: "Home", path: "/" },
          ...trail.map((c) => ({ name: c.name, path: `/categories/${c.slug}` })),
          { name: product.name, path: `/products/${product.slug}` },
        ]}
        overview={overview}
        specs={specGroups.length ? <ProductSpecs groups={specGroups} /> : null}
        delivery={<DeliveryInfo settings={settings} />}
        condition={<ConditionReport product={product} />}
        deliveryFrom={fees.length ? Math.min(...fees) : null}
        codEnabled={codEnabled(settings)}
        related={
          related.length > 0 ? (
            <section aria-labelledby="related-h" className="mt-12 sm:mt-16">
              <h2 id="related-h" className="text-title mb-5">More in {product.category}</h2>
              <ProductCarousel label={`More in ${product.category}`} autoplay={false}>
                {related.map((p) => (
                  <li key={p.id} className="w-[min(46vw,230px)] shrink-0 snap-start sm:w-[250px] lg:w-[calc((100%-3*1.25rem)/4)] lg:min-w-[250px]">
                    <ProductCard product={p} />
                  </li>
                ))}
              </ProductCarousel>
            </section>
          ) : null
        }
      />
    </>
  );
}
