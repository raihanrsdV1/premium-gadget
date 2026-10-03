"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Heart, LayoutDashboard, LogOut, Package, Phone, Wrench, X } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { BrandChip, conditionLinks } from "./MegaNav";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { SITE } from "@/lib/site";
import BrandLogo from "@/components/ui/BrandLogo";

/** Mobile navigation drawer: category accordions (sub-categories + brands), account and contact. */
export default function MobileDrawer({ open, onClose, categories = [], isAuthenticated, user, isAdmin, onLogout }) {
  const ref = useModalA11y(open, onClose);
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    onClose();
    // close on route change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;
  const row = "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold hover:bg-accent";

  return (
    <div className="fixed inset-0 z-[80] md:hidden">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[min(88vw,380px)] animate-[pg-pop_.2s_ease_both] flex-col bg-background shadow-float"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <BrandLogo markClassName="h-9 w-9" textClassName="text-lg" />
          <button type="button" onClick={onClose} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <ul className="space-y-0.5">
            {categories.map((c) => {
              const hasSub = (c.children?.length || 0) + (c.brands?.length || 0) + (c.conditions?.length || 0) > 0;
              const isOpen = expanded === c.id;
              return (
                <li key={c.id}>
                  {hasSub ? (
                    <>
                      <button
                        type="button"
                        className={`${row} w-full justify-between`}
                        aria-expanded={isOpen}
                        aria-controls={`m-${c.id}`}
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                      >
                        <span className="flex items-center gap-3"><CategoryIcon slug={c.slug} name={c.name} className="h-5 w-5 text-primary" />{c.name}</span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                      {isOpen && (
                        <div id={`m-${c.id}`} className="mb-2 ml-3 space-y-3 border-l-2 border-tint pl-4 pt-1">
                          <ul>
                            {c.children?.map((k) => (
                              <li key={k.slug}>
                                <Link href={`/categories/${encodeURIComponent(k.slug)}`} className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium hover:bg-accent">{k.name}</Link>
                              </li>
                            ))}
                          </ul>
                          {c.conditions?.length > 0 && (
                            <div>
                              <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Shop by condition</p>
                              <ul>
                                {conditionLinks(c).map((k) => (
                                  <li key={k.code}>
                                    <Link href={k.href} className="flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-medium hover:bg-accent">
                                      {k.label}<span className="text-xs text-muted-foreground">{k.count}</span>
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {c.brands?.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 pr-1">
                              {c.brands.map((b) => (
                                <BrandChip key={b.slug} brand={b} href={`/categories/${encodeURIComponent(c.slug)}?brand=${encodeURIComponent(b.slug)}`} />
                              ))}
                            </div>
                          )}
                          <Link href={`/categories/${encodeURIComponent(c.slug)}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-coral px-4 text-sm font-bold text-coral-foreground">
                            Explore all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link href={`/categories/${encodeURIComponent(c.slug)}`} className={row}>
                      <CategoryIcon slug={c.slug} name={c.name} className="h-5 w-5 text-primary" />{c.name}
                    </Link>
                  )}
                </li>
              );
            })}
            <li><Link href="/products" className={row}><ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />All products</Link></li>
            <li><Link href="/repairs" className={row}><Wrench className="h-5 w-5 text-primary" aria-hidden="true" />Repairs</Link></li>
            <li><Link href="/repairs/track" className={row}><Wrench className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Track a repair</Link></li>
          </ul>

          <div className="mt-4 border-t border-border pt-4">
            {isAuthenticated ? (
              <div className="space-y-0.5">
                <p className="px-3 pb-2 text-xs text-muted-foreground">Signed in as <span className="font-semibold text-foreground">{user?.full_name}</span></p>
                {isAdmin ? (
                  <Link href="/admin" className={row}><LayoutDashboard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Admin Dashboard</Link>
                ) : (
                  <>
                    <Link href="/orders" className={row}><Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />My Orders</Link>
                    <Link href="/wishlist" className={row}><Heart className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Wishlist</Link>
                  </>
                )}
                <button type="button" onClick={onLogout} className={`${row} w-full text-destructive`}><LogOut className="h-5 w-5" aria-hidden="true" />Log Out</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="flex h-11 items-center justify-center rounded-full border-[1.5px] border-foreground/25 text-sm font-bold">Log In</Link>
                <Link href="/register" className="flex h-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">Sign Up</Link>
                <Link href="/wishlist" className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-full bg-tint text-sm font-bold"><Heart className="h-4 w-4" aria-hidden="true" />Wishlist</Link>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <a href={`tel:${SITE.phoneE164}`} className="flex h-11 items-center justify-center gap-2 rounded-full bg-navy text-sm font-bold text-navy-foreground">
            <Phone className="h-4 w-4" aria-hidden="true" /> Call {SITE.phoneDisplay}
          </a>
        </div>
      </div>
    </div>
  );
}
