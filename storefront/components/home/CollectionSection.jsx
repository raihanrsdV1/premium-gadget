import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import ProductCard from "@/components/product/ProductCard";
import ProductCarousel from "./ProductCarousel";
import Countdown from "./Countdown";

/**
 * One admin collection on the home page, by `home_layout`:
 * carousel (scroll-snap row), grid, or countdown (flash sale to `ends_at`).
 * @param {{ collection: object, firstRow?: boolean }} props
 */
export default function CollectionSection({ collection: c, firstRow = false }) {
  const products = Array.isArray(c.products) ? c.products : [];
  if (!products.length) return null;
  const layout = c.home_layout === "countdown" && !c.ends_at ? "carousel" : c.home_layout;
  const href = `/collections/${c.slug}`;
  const headingId = `col-${c.slug}`;

  return (
    <section aria-labelledby={headingId} className="container">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {layout === "countdown" && <Zap className="h-6 w-6 shrink-0 fill-coral text-coral" aria-hidden="true" />}
            <h2 id={headingId} className="text-title">{c.name}</h2>
          </div>
          {c.description && <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted-foreground">{c.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {layout === "countdown" && <Countdown endsAt={c.ends_at} />}
          <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
            View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <li key={p.id}><ProductCard product={p} priority={firstRow && i < 2} /></li>
          ))}
        </ul>
      ) : (
        <ProductCarousel label={c.name}>
          {products.map((p, i) => (
            <li key={p.id} className="w-[min(46vw,230px)] shrink-0 snap-start sm:w-[250px] lg:w-[calc((100%-3*1.25rem)/4)] lg:min-w-[250px]">
              <ProductCard product={p} priority={firstRow && i < 2} />
            </li>
          ))}
        </ProductCarousel>
      )}
    </section>
  );
}
