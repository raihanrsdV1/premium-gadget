"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { Check, MapPin, Minus, Plus, ShieldCheck, ShoppingCart, Star, Truck, Zap } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { BADGE_TONES } from "@/components/product/ProductCard";
import ProductGallery from "@/components/product/ProductGallery";
import ProductTabs from "@/components/product/ProductTabs";
import Countdown from "@/components/home/Countdown";
import WishlistButton from "@/components/product/WishlistButton";
import { addItem } from "@/store/slices/cartSlice";
import { absoluteUrl, conditionOf, formatBDT, toNumber, warrantyText } from "@/lib/seo";
import { SITE } from "@/lib/site";
import CatMascot from "@/components/ui/CatMascot";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=800";

const chip = "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold leading-none";

/**
 * Interactive product page. Receives the already-fetched `product` from the
 * server page, so the first HTML is server-rendered. Server-rendered slots
 * keep the Markdown renderer and spec markup out of the client bundle:
 *  - `overview`, `specs`, `delivery`: panel content (rendered, hidden when inactive)
 *  - `condition`: <ConditionReport> (pre-owned only) or null
 *  - `related`: related products carousel or null
 */
export default function ProductDetailView({
  product,
  highlights = [],
  breadcrumbs = [],
  overview = null,
  specs = null,
  delivery = null,
  condition: conditionReport = null,
  related = null,
  deliveryFrom = null,
  codEnabled = true,
}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const variants = (product.variants || []).filter((v) => v.is_active !== false);
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const ctaRef = useRef(null);

  const activeVariant = variants.find((v) => v.id === selectedId) || variants[0] || null;
  const price = toNumber(activeVariant?.price ?? product.price) ?? 0;
  const compareAt = toNumber(activeVariant?.compare_at_price);
  const onSale = compareAt !== null && compareAt > price;
  const pct = onSale ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
  const saleEnds = onSale ? activeVariant?.sale_ends_at || null : null;

  const cond = conditionOf(product);
  const isUsed = cond.code !== "new";
  const badges = (Array.isArray(product.badges) ? product.badges : []).filter((b) => b?.label);

  const gallery = product.image_list?.length
    ? product.image_list.map((img) => ({ url: img.url, alt: img.alt_text || product.name }))
    : (product.images || []).map((url) => ({ url, alt: product.name }));
  const images = gallery.length ? gallery : [{ url: FALLBACK_IMAGE, alt: product.name }];

  const available = Number(activeVariant?.available ?? 0);
  const outOfStock = available <= 0;
  const lowStock = available > 0 && available <= 5;
  const effectiveQty = Math.min(qty, Math.max(available, 1));

  // Branch stock for the selected variant (falls back to the product total).
  const branches = (activeVariant?.branch_availability || product.branch_availability || []).filter((b) => b?.branch_name);
  const inBranches = branches.filter((b) => Number(b.available) > 0);

  // Show the sticky purchase bar once the main buttons scroll out of view.
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setBarVisible(!e.isIntersecting), { rootMargin: "0px 0px -64px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const selectVariant = (v) => {
    setSelectedId(v.id);
    setQty(1);
  };

  const addToCart = () => {
    if (outOfStock) return false;
    dispatch(
      addItem({
        id: activeVariant?.id || product.id,
        name: product.name,
        price,
        image: product.images?.[0] || "",
        slug: product.slug,
        variantName: activeVariant?.variant_name || "",
        quantity: effectiveQty,
        maxStock: available,
      })
    );
    return true;
  };
  const handleAdd = () => {
    if (addToCart()) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };
  const handleBuyNow = () => {
    if (addToCart()) router.push("/checkout");
  };

  const waText = `Hi Premium Gadget, I'm interested in ${product.name}${activeVariant?.variant_name ? ` (${activeVariant.variant_name})` : ""}. ${absoluteUrl(`/products/${product.slug}`)} Is it available?`;
  const waHref = `${SITE.whatsappUrl}?text=${encodeURIComponent(waText)}`;
  const warranty = warrantyText(product);
  const rating = product.rating?.count > 0 ? product.rating : null;

  const qtyBtn = "flex h-full w-11 items-center justify-center hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="container py-5 sm:py-8">
      <Breadcrumbs items={breadcrumbs} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductGallery images={images} name={product.name} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Badges + title */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {isUsed && <span className={`${chip} bg-tint text-primary`}>{cond.label}{product.condition_grade ? ` · Grade ${product.condition_grade}` : ""}</span>}
              {!isUsed && <span className={`${chip} bg-tint text-primary`}>Brand new</span>}
              {badges.map((b) => (
                <span key={b.label} className={`${chip} ${BADGE_TONES[b.tone] || BADGE_TONES.coral}`}>{b.label}</span>
              ))}
            </div>
            <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {product.brand && (
                <span>
                  Brand:{" "}
                  {product.brand_slug ? (
                    <Link href={`/brands/${product.brand_slug}`} className="font-bold text-foreground hover:text-primary hover:underline">{product.brand}</Link>
                  ) : (
                    <strong className="text-foreground">{product.brand}</strong>
                  )}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  <strong className="text-foreground">{Number(rating.average).toFixed(1)}</strong>
                  ({rating.count} review{rating.count === 1 ? "" : "s"})
                </span>
              )}
            </div>
            {product.short_description && <p className="leading-relaxed text-muted-foreground">{product.short_description}</p>}
            {highlights.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Key specs">
                {highlights.map((h, i) => (
                  <li key={i} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground" title={h.label}>
                    {h.label ? <span className="font-bold text-foreground">{h.label}: </span> : null}{h.value}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Price */}
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-[32px] font-extrabold leading-none sm:text-4xl">{formatBDT(price)}</span>
              {onSale && <span className="text-base text-muted-foreground line-through">{formatBDT(compareAt)}</span>}
              {onSale && pct >= 1 && <span className={`${chip} bg-coral text-coral-foreground`}>{pct}% off</span>}
            </div>
            {onSale && <p className="mt-1.5 text-sm font-semibold text-success">You save {formatBDT(compareAt - price)}</p>}
            {saleEnds && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 fill-coral text-coral" aria-hidden="true" />
                <Countdown endsAt={saleEnds} />
              </div>
            )}
          </div>

          {/* Variant picker */}
          {variants.length > 1 && (
            <fieldset className="border-0 p-0">
              <legend className="mb-2.5 text-sm font-bold">
                Option: <span className="font-medium text-muted-foreground">{activeVariant?.variant_name || activeVariant?.color}</span>
              </legend>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Choose an option">
                {variants.map((v) => {
                  const on = v.id === activeVariant?.id;
                  const sold = Number(v.available ?? 0) <= 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => selectVariant(v)}
                      className={`flex min-h-12 flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-navy bg-navy text-navy-foreground dark:border-primary dark:bg-primary dark:text-primary-foreground" : "border-border hover:border-primary/60"} ${sold && !on ? "opacity-60" : ""}`}
                    >
                      <span className="font-bold">{v.variant_name || v.color || v.sku}</span>
                      <span className={`text-xs ${on ? "opacity-85" : "text-muted-foreground"}`}>{sold ? "Out of stock" : formatBDT(v.price)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/* Stock + branches */}
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-bold">
              {outOfStock ? (
                <span className="text-destructive">Out of stock</span>
              ) : lowStock ? (
                <span className="text-destructive">Only {available} left</span>
              ) : (
                <span className="text-success">In stock</span>
              )}
            </p>
            {branches.length > 0 && (
              <div className="mt-2 flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  {inBranches.length > 0 ? (
                    <p><strong>Available at {inBranches.map((b) => b.branch_name).join(" / ")}</strong></p>
                  ) : (
                    <p className="text-muted-foreground">Not on the shelf at either branch right now.</p>
                  )}
                  {inBranches.length > 0 && (
                    <p className="text-muted-foreground">
                      Visit us at {inBranches.map((b) => SITE.branches.find((s) => s.name === b.branch_name)?.street ? `${b.branch_name}, ${SITE.branches.find((s) => s.name === b.branch_name).street}` : b.branch_name).join(" or ")}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Purchase */}
          <div ref={ctaRef} className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex h-12 shrink-0 items-center overflow-hidden rounded-full border-[1.5px] border-foreground/25" role="group" aria-label="Quantity">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={outOfStock || effectiveQty <= 1} className={qtyBtn}><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center font-bold" aria-live="polite">{effectiveQty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(available, q + 1))} disabled={outOfStock || effectiveQty >= available} className={qtyBtn}><Plus className="h-4 w-4" /></button>
              </div>
              <Button size="lg" variant="navy" className="flex-1 dark:bg-primary dark:text-primary-foreground" onClick={handleAdd} disabled={outOfStock}>
                {outOfStock ? "Out of stock" : added ? <><Check className="h-5 w-5" /> Added</> : <><ShoppingCart className="h-5 w-5" /> Add to cart</>}
              </Button>
              <div className="hidden sm:block [&>button]:h-12 [&>button]:w-12 [&>button]:px-0"><WishlistButton productId={product.id} /></div>
            </div>
            <Button size="lg" variant="coral" onClick={handleBuyNow} disabled={outOfStock}>Buy now</Button>
            <a href={waHref} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "lg", className: "border-[#1FA855] text-[#177A3E] hover:bg-[#1FA855]/10 hover:border-[#1FA855] dark:text-[#4CD07F]" })}>
              <CatMascot size={36} className="-my-1 mr-1" />
              Ask on WhatsApp about this item
            </a>
          </div>

          {/* Trust */}
          <ul className="grid gap-2.5 rounded-2xl bg-tint p-4 text-sm sm:grid-cols-2">
            {warranty && <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {warranty.charAt(0).toUpperCase() + warranty.slice(1)}</li>}
            <li className="flex items-center gap-2"><Truck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {deliveryFrom ? `Delivery from ${formatBDT(deliveryFrom)}` : "Delivery across Bangladesh"}</li>
            {codEnabled && <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Cash on delivery</li>}
            {!isUsed && <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Sealed, brand new</li>}
          </ul>

          {isUsed && conditionReport}
        </div>
      </div>

      {/* Details */}
      <div className="mt-10 sm:mt-14">
        <ProductTabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (product.key_features?.length > 0 || overview) ? (
                <div className="grid gap-8 lg:max-w-4xl">
                  {product.key_features?.length > 0 && (
                    <section>
                      <h2 className="mb-4 font-display text-xl font-extrabold">Key features</h2>
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {product.key_features.map((f, i) => (
                          <li key={i} className="flex items-start gap-3 rounded-2xl bg-tint p-4 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {overview && (
                    <section>
                      <h2 className="mb-3 font-display text-xl font-extrabold">About this item</h2>
                      <div className="leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-3 [&_ul]:mb-3">{overview}</div>
                    </section>
                  )}
                </div>
              ) : null,
            },
            { id: "specs", label: "Specs", content: specs ? <div className="lg:max-w-3xl">{specs}</div> : null },
            {
              id: "delivery",
              label: "Delivery & warranty",
              content: (
                <div className="grid gap-4">
                  {(warranty || product.warranty_notes) && (
                    <section className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Warranty</h3>
                      {warranty && <p className="text-sm font-semibold">{warranty.charAt(0).toUpperCase() + warranty.slice(1)}</p>}
                      {product.warranty_notes && <p className="mt-1 text-sm text-muted-foreground">{product.warranty_notes}</p>}
                    </section>
                  )}
                  {delivery}
                </div>
              ),
            },
          ]}
        />
      </div>

      {related}

      {/* Mobile sticky purchase bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-float backdrop-blur transition-transform duration-200 lg:hidden ${barVisible ? "translate-y-0" : "translate-y-full"}`}
        aria-hidden={!barVisible}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{product.name}</p>
            <p className="font-display text-lg font-extrabold leading-tight">{formatBDT(price)}</p>
          </div>
          <Button variant="navy" className="dark:bg-primary dark:text-primary-foreground" onClick={handleAdd} disabled={outOfStock} tabIndex={barVisible ? 0 : -1}>
            {added ? <Check className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />} {outOfStock ? "Out of stock" : added ? "Added" : "Add"}
          </Button>
          <Button variant="coral" onClick={handleBuyNow} disabled={outOfStock} tabIndex={barVisible ? 0 : -1}>Buy now</Button>
        </div>
      </div>
    </div>
  );
}
