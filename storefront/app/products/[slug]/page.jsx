import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/api/products";
import ProductDetailView from "@/components/ProductDetailView";

// Generate <title> and meta description on the server from the product fields.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: "Product Not Found" };
  }

  return {
    title: product.meta_title || product.name,
    description:
      product.meta_description || product.short_description || product.name,
  };
}

// Map the product's condition to a Schema.org itemCondition URL.
function itemConditionUrl(condition) {
  return condition === "used"
    ? "https://schema.org/UsedCondition"
    : "https://schema.org/NewCondition";
}

function buildProductJsonLd(product) {
  const variants = product.variants || [];
  const primaryVariant = variants[0] || null; // cheapest (API orders by price ASC)

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.short_description || product.meta_description || product.name,
    image: product.images?.length ? product.images : undefined,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand }
      : undefined,
    sku: primaryVariant?.sku || undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: primaryVariant ? Number(primaryVariant.price).toFixed(2) : undefined,
      availability: variants.length
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: itemConditionUrl(product.condition),
    },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const jsonLd = buildProductJsonLd(product);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailView product={product} />
    </>
  );
}
