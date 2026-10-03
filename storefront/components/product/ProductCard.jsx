import Link from "next/link";
import Img from "@/components/ui/Img";
import AddToCartButton from "./AddToCartButton";
import WishlistHeart from "./WishlistHeart";
import { formatBDT, highlightsOf, toNumber } from "@/lib/seo";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400";

/** Badge tone (collections' badge_tone) -> brand colours. All pass AA for 11px bold text. */
export const BADGE_TONES = {
  coral: "bg-coral text-coral-foreground",
  blue: "bg-primary text-primary-foreground",
  navy: "bg-navy text-navy-foreground",
  green: "bg-success text-success-foreground",
  amber: "bg-warning text-warning-foreground",
};

const chip = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold leading-none shadow-sm";

/**
 * Product card used by every grid and carousel (Server Component with two
 * small client islands: wishlist heart and add-to-cart).
 *
 * Reads: image, name, brand, price, compare_at_price, in_stock, low_stock,
 * badges [{label,tone}] (max 2), condition / condition_code, condition_grade,
 * highlights [{label,value}] (max 4).
 * `action` is kept for old callers; every card now shows add-to-cart.
 */
export default function ProductCard({ product, priority = false }) {
  const href = `/products/${product.slug}`;
  const price = toNumber(product.price) ?? 0;
  const compareAt = toNumber(product.compare_at_price);
  const onSale = compareAt !== null && compareAt > price;
  const pct = onSale ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
  const isUsed = ["used", "pre-owned"].includes(String(product.condition_code || product.condition || "").toLowerCase());
  const outOfStock = product.in_stock === false;
  const badges = (Array.isArray(product.badges) && product.badges.length
    ? product.badges
    : product.badge ? [{ label: product.badge, tone: "coral" }] : []
  ).filter((b) => b?.label).slice(0, 2);
  const highlights = highlightsOf(product);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card pg-card hover:shadow-pop focus-within:shadow-pop sm:rounded-[22px]">
      <div className="relative bg-white dark:bg-[#EEF2FF]">
        <Link href={href} className="relative block aspect-[4/3] overflow-hidden" aria-label={product.name} tabIndex={-1}>
          <Img
            src={product.image || FALLBACK_IMAGE}
            alt=""
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
            priority={priority}
            className={`object-cover object-center transition-transform duration-500 motion-safe:group-hover:scale-[1.04] ${outOfStock ? "opacity-60 grayscale" : ""}`}
          />
        </Link>

        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/25 to-transparent" />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1 sm:left-4 sm:top-4">
          {badges.map((b) => (
            <span key={b.label} className={`${chip} ${BADGE_TONES[b.tone] || BADGE_TONES.coral}`}>{b.label}</span>
          ))}
        </div>
        <WishlistHeart productId={product.id} name={product.name} className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4" />
        {onSale && pct >= 1 && (
          <span className={`${chip} absolute bottom-3 left-3 bg-coral text-coral-foreground sm:bottom-4 sm:left-4`}>-{pct}%</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
          {isUsed && (
            <span className="rounded-full bg-tint px-2 py-0.5 text-primary">
              Used{product.condition_grade ? ` · Grade ${product.condition_grade}` : ""}
            </span>
          )}
          {product.brand && <span className="uppercase tracking-wider text-muted-foreground">{product.brand}</span>}
        </div>

        <h3 className="font-display text-sm font-bold leading-snug sm:text-base">
          <Link href={href} className="line-clamp-2 transition-colors hover:text-primary after:absolute after:inset-0 after:z-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        {highlights.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Key specs">
            {highlights.map((h, i) => (
              <li
                key={`${h.label}-${i}`}
                title={h.label ? `${h.label}: ${h.value}` : h.value}
                className={`max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:text-xs ${i >= 2 ? "hidden sm:block" : ""}`}
              >
                {h.value}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold sm:text-xs">
              {outOfStock ? (
                <span className="text-muted-foreground">Out of stock</span>
              ) : product.low_stock ? (
                <span className="text-destructive">Only a few left</span>
              ) : (
                <span className="text-success">In stock</span>
              )}
            </div>
            {onSale && <span className="block text-xs text-muted-foreground line-through sm:text-[13px]">{formatBDT(compareAt)}</span>}
            <span className="block font-display text-lg font-extrabold leading-tight sm:text-[22px]">{formatBDT(price)}</span>
          </div>
          <div className="relative z-10 shrink-0">
            {outOfStock ? (
              <Link href={href} className="flex h-10 items-center rounded-full border-[1.5px] border-foreground/25 px-3 text-xs font-bold hover:bg-accent sm:h-11">Details</Link>
            ) : (
              <AddToCartButton
                product={{ id: product.id, name: product.name, price, image: product.image, slug: product.slug }}
                iconOnly
                variant="navy"
                className="h-10 w-10 rounded-full px-0 sm:h-11 sm:w-11"
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
