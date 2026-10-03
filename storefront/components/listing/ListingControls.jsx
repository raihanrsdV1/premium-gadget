"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { Button } from "@/components/ui/Button";
import { listingHref, SORTS } from "@/lib/listing";

const PRICE_PRESETS = [
  { label: "Under ৳30k", min: undefined, max: 30000 },
  { label: "৳30k - 60k", min: 30000, max: 60000 },
  { label: "৳60k - 100k", min: 60000, max: 100000 },
  { label: "Over ৳100k", min: 100000, max: undefined },
];
const CONDITIONS = [
  { value: undefined, label: "Any" },
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
  { value: "open_box", label: "Open box" },
];

const radio = "h-4 w-4 shrink-0 accent-primary";
const numInput =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Group({ title, children }) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2.5 font-display text-sm font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Option({ checked, onChange, name, label, count, indent = false, type = "radio" }) {
  return (
    <label className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 text-sm hover:bg-accent ${indent ? "ml-4" : ""}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} className={radio} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
    </label>
  );
}

/** The filter fields. `value` is the current params; `onChange(patch)` receives changed keys. */
function FilterFields({ value, onChange, facets, hide, idPrefix, commitPriceOn }) {
  const [min, setMin] = useState(value.min_price ?? "");
  const [max, setMax] = useState(value.max_price ?? "");
  useEffect(() => {
    setMin(value.min_price ?? "");
    setMax(value.max_price ?? "");
  }, [value.min_price, value.max_price]);

  const num = (s) => {
    const n = Number.parseInt(String(s), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const commitPrice = (a = min, b = max) => {
    let lo = num(a);
    let hi = num(b);
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    if (lo !== value.min_price || hi !== value.max_price) onChange({ min_price: lo, max_price: hi });
  };
  const onPriceChange = (setter, which) => (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 9);
    setter(v);
    if (commitPriceOn === "change") commitPrice(which === "min" ? v : min, which === "max" ? v : max);
  };
  const key = (e) => e.key === "Enter" && (e.preventDefault(), commitPrice());

  return (
    <div className="space-y-6">
      {!hide.category && facets.categories?.length > 0 && (
        <Group title="Category">
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            <Option name={`${idPrefix}-cat`} label="All categories" checked={!value.category} onChange={() => onChange({ category: undefined })} />
            {facets.categories.map((c) => (
              <Option key={c.slug} name={`${idPrefix}-cat`} label={c.name} count={c.count} indent={c.depth > 0} checked={value.category === c.slug} onChange={() => onChange({ category: c.slug })} />
            ))}
          </div>
        </Group>
      )}

      {!hide.brand && facets.brands?.length > 0 && (
        <Group title="Brand">
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            <Option name={`${idPrefix}-brand`} label="All brands" checked={!value.brand} onChange={() => onChange({ brand: undefined })} />
            {facets.brands.map((b) => (
              <Option key={b.slug} name={`${idPrefix}-brand`} label={b.name} count={b.count} checked={value.brand === b.slug} onChange={() => onChange({ brand: b.slug })} />
            ))}
          </div>
        </Group>
      )}

      <Group title="Condition">
        <div className="space-y-0.5">
          {CONDITIONS.map((c) => (
            <Option key={c.label} name={`${idPrefix}-cond`} label={c.label} checked={value.condition === c.value} onChange={() => onChange({ condition: c.value })} />
          ))}
        </div>
      </Group>

      <Group title="Price (৳)">
        <div className="flex items-center gap-2">
          <input inputMode="numeric" aria-label="Minimum price" placeholder="Min" value={min} onChange={onPriceChange(setMin, "min")} onBlur={() => commitPriceOn === "blur" && commitPrice()} onKeyDown={key} className={numInput} />
          <span className="text-muted-foreground" aria-hidden="true">-</span>
          <input inputMode="numeric" aria-label="Maximum price" placeholder="Max" value={max} onChange={onPriceChange(setMax, "max")} onBlur={() => commitPriceOn === "blur" && commitPrice()} onKeyDown={key} className={numInput} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => {
            const on = value.min_price === p.min && value.max_price === p.max;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? { min_price: undefined, max_price: undefined } : { min_price: p.min, max_price: p.max })}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Availability">
        <Option type="checkbox" name={`${idPrefix}-stock`} label="In stock only" checked={value.instock === "1"} onChange={(e) => onChange({ instock: e.target.checked ? "1" : undefined })} />
      </Group>
    </div>
  );
}

function useListingNav(basePath, params) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (next) => startTransition(() => router.push(listingHref(basePath, { ...next, page: 1 }), { scroll: false }));
  const apply = (patch) => go({ ...params, ...patch });
  return { go, apply, pending };
}

const keepFixed = (params, hide) => ({
  sort: params.sort,
  ...(hide.category && { category: params.category }),
  ...(hide.brand && { brand: params.brand }),
});

/** Desktop filter sidebar. Filter state lives in the URL: each change navigates with new params. */
export function ListingSidebar({ basePath, params, facets, hide = {}, activeCount }) {
  const { go, apply } = useListingNav(basePath, params);
  return (
    <aside aria-label="Filters" className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-card scrollbar-none">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-extrabold">Filters</h2>
          {activeCount > 0 && (
            <button type="button" onClick={() => go(keepFixed(params, hide))} className="text-xs font-bold text-primary hover:underline">
              Clear all
            </button>
          )}
        </div>
        <FilterFields value={params} onChange={apply} facets={facets} hide={hide} idPrefix="d" commitPriceOn="blur" />
      </div>
    </aside>
  );
}

/** Result count, sort, and (below lg) the Filters button with its bottom sheet. */
export function ListingToolbar({ basePath, params, facets, hide = {}, total, activeCount, showFilters = true, sortOptions = SORTS }) {
  const { go, apply, pending } = useListingNav(basePath, params);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(params);
  const close = () => setOpen(false);
  const sheetRef = useModalA11y(open, close);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground" aria-live="polite">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {total != null && <span><strong className="text-foreground">{total}</strong> {total === 1 ? "product" : "products"}</span>}
        </p>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {showFilters && (
            <Button variant="outline" size="sm" className="h-10 lg:hidden" onClick={() => { setDraft(params); setOpen(true); }} aria-haspopup="dialog">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only text-muted-foreground">Sort by</span>
            <select
              value={params.sort || "newest"}
              onChange={(e) => apply({ sort: e.target.value === "newest" ? undefined : e.target.value })}
              className="h-10 w-[8.5rem] truncate rounded-full border-[1.5px] border-foreground/25 bg-background px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xs:w-auto xs:px-4"
            >
              {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {showFilters && open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Filters" className="absolute inset-x-0 bottom-0 flex max-h-[88vh] animate-[pg-pop_.2s_ease_both] flex-col rounded-t-3xl bg-background shadow-float">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
              <span className="font-display text-lg font-extrabold">Filters</span>
              <button type="button" onClick={close} aria-label="Close filters" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              <FilterFields value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} facets={facets} hide={hide} idPrefix="m" commitPriceOn="change" />
            </div>
            <div className="flex shrink-0 gap-3 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" className="flex-1" onClick={() => setDraft(keepFixed(draft, hide))}>Reset</Button>
              <Button className="flex-[2]" onClick={() => { close(); go(draft); }}>Show results</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
