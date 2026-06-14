import { Suspense } from "react";
import Link from "next/link";
import { getProducts } from "@/lib/api/products";
import ProductCard from "@/components/product/ProductCard";
import ProductFilters from "@/components/product/ProductFilters";
import { Button } from "@/components/ui/Button";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function headingFor(sp) {
  if (sp.category) return sp.category.charAt(0).toUpperCase() + sp.category.slice(1).replace(/-/g, " ");
  if (sp.condition === "used") return "Pre-Owned";
  if (sp.brand) return sp.brand.charAt(0).toUpperCase() + sp.brand.slice(1);
  return "All Products";
}

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const heading = headingFor(sp);
  return {
    title: heading,
    description: `Browse ${heading} at Premium Gadget — genuine products, warranty, and fast delivery across Bangladesh.`,
  };
}

export default async function ProductListPage({ searchParams }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || "1", 10);
  const params = {
    page,
    limit: 12,
    ...(sp.category && { category: sp.category }),
    ...(sp.condition && { condition: sp.condition }),
    ...(sp.brand && { brand: sp.brand }),
  };

  let products = [];
  let pagination = null;
  let failed = false;
  try {
    const result = await getProducts(params);
    products = result.data;
    pagination = result.pagination;
  } catch {
    failed = true;
  }

  const heading = headingFor(sp);

  // Build a page href preserving current filters.
  const pageHref = (p) => {
    const qs = new URLSearchParams();
    if (sp.category) qs.set("category", sp.category);
    if (sp.condition) qs.set("condition", sp.condition);
    if (sp.brand) qs.set("brand", sp.brand);
    qs.set("page", String(p));
    return `/products?${qs.toString()}`;
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: heading, item: `${SITE_URL}/products` },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: (page - 1) * 12 + i + 1,
      url: `${SITE_URL}/products/${p.slug}`,
      name: p.name,
    })),
  };

  return (
    <div className="container px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center text-sm text-muted-foreground mb-4 gap-1">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground">{heading}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
            {pagination && (
              <p className="text-muted-foreground mt-1 text-sm">{pagination.total} products found</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <Suspense fallback={null}>
          <ProductFilters />
        </Suspense>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          {failed ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="font-semibold mb-1">Could not load products</p>
              <p className="text-sm text-muted-foreground">Make sure the backend is running.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="font-semibold mb-1">No products found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters.</p>
              <Link href="/products" className="mt-4 inline-block">
                <Button variant="outline">Clear Filters</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} action="view" />
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2 flex-wrap">
                  {pagination.hasPrev ? (
                    <Link href={pageHref(page - 1)}><Button variant="outline" size="sm">Previous</Button></Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                  )}
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <Link key={p} href={pageHref(p)}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={p === page ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                      >
                        {p}
                      </Button>
                    </Link>
                  ))}
                  {pagination.hasNext ? (
                    <Link href={pageHref(page + 1)}><Button variant="outline" size="sm">Next</Button></Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Next</Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
