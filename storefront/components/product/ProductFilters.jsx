"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal, Filter, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Filter options that the backend /products endpoint actually supports
// (category by slug, brand by slug, condition new/used).
const CONDITIONS = [
  { label: "New", value: "new" },
  { label: "Pre-Owned", value: "used" },
];
const BRANDS = [
  ["Apple", "apple"],
  ["Dell", "dell"],
  ["HP", "hp"],
  ["Lenovo", "lenovo"],
  ["Logitech", "logitech"],
  ["Samsung", "samsung"],
  ["Anker", "anker"],
  ["Sony", "sony"],
];
// "Laptops" now returns its child-category products (backend descendant match).
// "Pre-Owned" is intentionally NOT a category here — it's the Condition filter
// below (the pre-owned *category* is empty and was contradictory).
const CATEGORIES = [
  ["Laptops", "laptops"],
  ["MacBooks", "macbooks"],
  ["Windows Laptops", "windows-laptops"],
  ["Accessories", "accessories"],
];

/**
 * Link-based filter sidebar. Each option navigates to the same route with the
 * query param toggled, so the Server Component re-fetches — filters work even
 * without client JS for the actual filtering (only the mobile collapse is
 * stateful).
 */
export default function ProductFilters() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const buildHref = (key, value) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page"); // reset to page 1 on filter change
    if (p.get(key) === value) p.delete(key);
    else p.set(key, value);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const isActive = (key, value) => sp.get(key) === value;

  const checkbox = (active) => (
    <div
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
        active ? "bg-primary border-primary text-primary-foreground" : "border-input group-hover:border-primary"
      }`}
    >
      {active && <Check className="h-3 w-3" />}
    </div>
  );

  return (
    <>
      <Button variant="outline" className="lg:hidden mb-4" onClick={() => setOpen((v) => !v)}>
        <Filter className="mr-2 h-4 w-4" /> Filters
      </Button>

      <aside className={`${open ? "block" : "hidden"} lg:block w-full lg:w-56 shrink-0 space-y-6`}>
        <div className="flex items-center gap-2 mb-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="font-semibold text-sm">Filters</span>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-3">Condition</h4>
          <div className="space-y-2">
            {CONDITIONS.map(({ label, value }) => (
              <Link key={value} href={buildHref("condition", value)} className="flex items-center gap-2 cursor-pointer group" scroll={false}>
                {checkbox(isActive("condition", value))}
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-3">Category</h4>
          <div className="space-y-2">
            {CATEGORIES.map(([label, slug]) => (
              <Link key={slug} href={buildHref("category", slug)} className="flex items-center gap-2 cursor-pointer group" scroll={false}>
                {checkbox(isActive("category", slug))}
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-3">Brand</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {BRANDS.map(([label, slug]) => (
              <Link key={slug} href={buildHref("brand", slug)} className="flex items-center gap-2 cursor-pointer group" scroll={false}>
                {checkbox(isActive("brand", slug))}
                <span className="text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
