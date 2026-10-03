"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import Img from "@/components/ui/Img";
import { formatBDT, toNumber } from "@/lib/seo";
import { conditionHref, conditionTitle } from "@/lib/listing";

const OPEN_DELAY = 90;
const CLOSE_DELAY = 160;

/** "Shop by condition" links ("Used laptops"), built from the menu's `conditions`. */
export function conditionLinks(category) {
  return (category.conditions || []).map((k) => ({
    code: k.code,
    count: k.count,
    label: conditionTitle(k.code, category.name),
    href: conditionHref(category.slug, k.code),
  }));
}

export function BrandChip({ brand, href, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={brand.name}
      className={`group flex h-12 items-center justify-center rounded-xl border border-border px-2 text-center text-xs font-bold text-foreground transition-all hover:border-primary hover:bg-accent hover:shadow-card focus-visible:border-primary ${brand.logo_url ? "bg-white dark:bg-[#EEF2FF] dark:hover:bg-white" : "bg-muted/60"}`}
    >
      {brand.logo_url ? (
        <span className="relative block h-full w-full">
          <Img src={brand.logo_url} alt={brand.name} fill sizes="120px" className="object-contain p-2" />
        </span>
      ) : (
        <span className="line-clamp-2">{brand.name}</span>
      )}
    </Link>
  );
}

/**
 * Desktop category bar. Each category with sub-categories or brands opens a
 * mega panel on hover AND keyboard focus (focus-within), closes on Esc, on
 * leaving, and on navigation. Data: GET /catalog/menu via the layout.
 */
export default function MegaNav({ categories = [] }) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState(null);
  const timer = useRef(null);

  const schedule = (id, delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenId(id), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    setOpenId(null);
  }, [pathname]);

  const linkBase =
    "flex h-11 items-center gap-1 rounded-full px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:bg-accent whitespace-nowrap";

  return (
    <nav aria-label="Shop by category" className="hidden border-t border-border md:block" onMouseLeave={() => schedule(null, CLOSE_DELAY)}>
      <div className="container relative">
        <ul className="flex items-center gap-0.5 overflow-visible">
          {categories.map((c) => {
            const hasPanel = (c.children?.length || 0) + (c.brands?.length || 0) + (c.conditions?.length || 0) > 0;
            const open = openId === c.id;
            const panelId = `mega-${c.id}`;
            return (
              <li
                key={c.id}
                onMouseEnter={() => schedule(hasPanel ? c.id : null, hasPanel ? OPEN_DELAY : CLOSE_DELAY)}
                onFocus={() => {
                  clearTimeout(timer.current);
                  setOpenId(hasPanel ? c.id : null);
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setOpenId((cur) => (cur === c.id ? null : cur));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && open) {
                    e.stopPropagation();
                    setOpenId(null);
                    e.currentTarget.querySelector("a")?.focus();
                  }
                }}
              >
                <Link
                  href={`/categories/${encodeURIComponent(c.slug)}`}
                  className={`${linkBase} ${open ? "bg-accent" : ""}`}
                  aria-expanded={hasPanel ? open : undefined}
                  aria-controls={hasPanel ? panelId : undefined}
                >
                  {c.name}
                  {hasPanel && <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
                </Link>

                {hasPanel && open && (
                  <div
                    id={panelId}
                    className="absolute left-4 top-full z-[60] -mt-px w-[min(calc(100%-2rem),1040px)] rounded-b-3xl border border-t-0 border-border bg-popover p-6 text-popover-foreground shadow-float"
                  >
                    {(() => {
                      const conds = conditionLinks(c);
                      const prods = (c.products || []).slice(0, 3);
                      const cols = [true, c.brands?.length > 0, prods.length > 0].filter(Boolean).length;
                      const grid = cols === 3 ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.25fr)]" : cols === 2 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : "";
                      const head = "mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground";
                      const row = "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-accent hover:text-primary focus-visible:bg-accent";
                      return (
                        <div className={`grid gap-x-8 gap-y-6 ${grid}`}>
                          <div className="flex flex-col">
                            {conds.length > 0 && (
                              <>
                                <p className={head}>Shop by condition</p>
                                <ul className="space-y-0.5">
                                  {conds.map((k) => (
                                    <li key={k.code}>
                                      <Link href={k.href} className={row}>{k.label}<span className="text-xs font-medium text-muted-foreground">{k.count}</span></Link>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                            {c.children?.length > 0 && (
                              <>
                                <p className={`${head} ${conds.length ? "mt-4" : ""}`}>Sub-categories</p>
                                <ul className="space-y-0.5">
                                  {c.children.map((k) => (
                                    <li key={k.slug}><Link href={`/categories/${encodeURIComponent(k.slug)}`} className={row}>{k.name}</Link></li>
                                  ))}
                                </ul>
                              </>
                            )}
                            <Link
                              href={`/categories/${encodeURIComponent(c.slug)}`}
                              className="mt-5 inline-flex h-10 items-center gap-2 self-start rounded-full bg-coral px-5 text-sm font-bold text-coral-foreground hover:bg-coral/85"
                            >
                              Explore all {c.name} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          </div>
                          {c.brands?.length > 0 && (
                            <div>
                              <p className={head}>Shop by brand</p>
                              <div className="grid grid-cols-3 gap-2">
                                {c.brands.map((b) => (
                                  <BrandChip key={b.slug} brand={b} href={`/categories/${encodeURIComponent(c.slug)}?brand=${encodeURIComponent(b.slug)}`} />
                                ))}
                              </div>
                            </div>
                          )}
                          {prods.length > 0 && (
                            <div>
                              <p className={head}>Popular in {c.name}</p>
                              <ul className="space-y-2">
                                {prods.map((p) => {
                                  const price = toNumber(p.price);
                                  const was = toNumber(p.compare_at_price);
                                  return (
                                    <li key={p.slug}>
                                      <Link href={`/products/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-border p-2 transition-colors hover:border-primary hover:bg-accent focus-visible:border-primary">
                                        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-[#EEF2FF]">
                                          {p.image && <Img src={p.image} alt="" fill sizes="56px" className="object-contain p-1" />}
                                        </span>
                                        <span className="min-w-0">
                                          <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</span>
                                          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                                            <span className="font-display text-sm font-extrabold text-primary">{formatBDT(price)}</span>
                                            {was !== null && was > price && <span className="text-xs text-muted-foreground line-through">{formatBDT(was)}</span>}
                                            {p.in_stock === false && <span className="text-xs font-semibold text-muted-foreground">Out of stock</span>}
                                          </span>
                                        </span>
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </li>
            );
          })}
          <li className="ml-auto flex items-center gap-0.5">
            <Link href="/repairs" className={linkBase}>Repairs</Link>
            <Link href="/repairs/track" className={`${linkBase} text-muted-foreground`}>Track repair</Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
