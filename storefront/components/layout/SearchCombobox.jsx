"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, Tag, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { fetchSuggestions } from "@/lib/api/suggest";
import { formatBDT, toNumber } from "@/lib/seo";
import Img from "@/components/ui/Img";

const EMPTY = { products: [], categories: [], brands: [], total: 0 };

/**
 * Header typeahead (ARIA 1.2 combobox with a listbox popup).
 * Keys: ↓/↑ move, Enter opens the active option (or searches the text),
 * Esc closes (second Esc clears), Home/End jump inside the list.
 */
export default function SearchCombobox({ autoFocus = false, onDone, className = "", inputClassName = "", idPrefix = "search" }) {
  const router = useRouter();
  const uid = useId();
  const listId = `${idPrefix}-${uid}-list`;
  const [query, setQuery] = useState("");
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const debounced = useDebounce(query.trim(), 250);
  const ready = debounced.length >= 2;

  useEffect(() => {
    if (!ready) {
      setData(EMPTY);
      setLoading(false);
      setFailed(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    fetchSuggestions(debounced, ctrl.signal)
      .then((d) => {
        setData(d);
        setActive(-1);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setData(EMPTY);
        setFailed(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [debounced, ready]);

  // Close when focus/click leaves the widget.
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Flat, ordered option list: it drives both rendering and keyboard nav.
  const options = useMemo(() => {
    const list = [];
    data.categories.forEach((c) => list.push({ type: "category", key: `c-${c.slug}`, href: `/categories/${encodeURIComponent(c.slug)}`, c }));
    data.brands.forEach((b) => list.push({ type: "brand", key: `b-${b.slug}`, href: `/brands/${encodeURIComponent(b.slug)}`, b }));
    data.products.forEach((p) => list.push({ type: "product", key: `p-${p.id}`, href: `/products/${p.slug}`, p }));
    if (data.products.length || data.categories.length || data.brands.length) {
      list.push({ type: "all", key: "all", href: `/search?q=${encodeURIComponent(debounced)}` });
    }
    return list;
  }, [data, debounced]);

  const showPanel = open && ready;
  const pending = loading || debounced !== query.trim();
  const optId = (i) => `${listId}-opt-${i}`;

  const go = (href) => {
    setOpen(false);
    onDone?.();
    router.push(href);
  };

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (active >= 0 && options[active]) return go(options[active].href);
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e) => {
    const n = options.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (n) setActive((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Home" && open && active >= 0) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && open && active >= 0) {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === "Escape") {
      if (open) {
        setOpen(false);
        setActive(-1);
        e.stopPropagation();
      } else if (query) {
        setQuery("");
      }
    }
  };

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const optionClass = (i) =>
    `flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer text-sm ${active === i ? "bg-accent" : "hover:bg-accent/60"}`;
  const idx = (type, key) => options.findIndex((o) => o.type === type && o.key === key);

  const cats = options.filter((o) => o.type === "category");
  const brands = options.filter((o) => o.type === "brand");
  const prods = options.filter((o) => o.type === "product");
  const all = options.find((o) => o.type === "all");

  const statusText = loading
    ? "Searching"
    : failed
      ? "Search suggestions are unavailable"
      : ready
        ? `${options.length ? data.total : 0} results`
        : "";

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <form role="search" onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search products"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search ThinkPad, MacBook, SSD…"
          className={`h-11 w-full rounded-full border border-input bg-background pl-11 pr-20 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/30 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden ${inputClassName}`}
        />
        {loading && <Loader2 className="absolute right-[3.4rem] top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-12 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            style={{ display: loading ? "none" : undefined }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <p className="sr-only" role="status" aria-live="polite">{statusText}</p>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-[70] mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-float md:min-w-[460px]"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground" role="presentation">
              {pending ? "Searching…" : failed ? "Couldn't load suggestions. Press Enter to search." : <>No matches for <strong className="text-foreground">&ldquo;{debounced}&rdquo;</strong>. Try a brand or model.</>}
            </div>
          )}

          {cats.length > 0 && (
            <div role="group" aria-label="Categories">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden="true">Categories</p>
              {cats.map((o) => {
                const i = idx("category", o.key);
                return (
                  <div key={o.key} id={optId(i)} role="option" aria-selected={active === i} onClick={() => go(o.href)} onMouseEnter={() => setActive(i)} className={optionClass(i)}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint text-primary"><Tag className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="font-semibold">{o.c.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {brands.length > 0 && (
            <div role="group" aria-label="Brands">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden="true">Brands</p>
              {brands.map((o) => {
                const i = idx("brand", o.key);
                return (
                  <div key={o.key} id={optId(i)} role="option" aria-selected={active === i} onClick={() => go(o.href)} onMouseEnter={() => setActive(i)} className={optionClass(i)}>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white text-xs font-bold text-slate-700">
                      {o.b.logo_url ? <Img src={o.b.logo_url} alt="" fill sizes="36px" className="object-contain p-1" /> : o.b.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold">{o.b.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {prods.length > 0 && (
            <div role="group" aria-label="Products">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden="true">Products</p>
              {prods.map((o) => {
                const i = idx("product", o.key);
                const price = toNumber(o.p.price);
                const was = toNumber(o.p.compare_at_price);
                return (
                  <div key={o.key} id={optId(i)} role="option" aria-selected={active === i} onClick={() => go(o.href)} onMouseEnter={() => setActive(i)} className={optionClass(i)}>
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                      {o.p.image && <Img src={o.p.image} alt="" fill sizes="48px" className="object-contain p-0.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 font-semibold">{o.p.name}</span>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-bold text-primary">{price !== null ? formatBDT(price) : ""}</span>
                        {was !== null && price !== null && was > price && <span className="text-xs text-muted-foreground line-through">{formatBDT(was)}</span>}
                        {o.p.in_stock === false && <span className="text-xs font-semibold text-destructive">Out of stock</span>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {all && (
            <div
              id={optId(options.length - 1)}
              role="option"
              aria-selected={active === options.length - 1}
              onClick={() => go(all.href)}
              onMouseEnter={() => setActive(options.length - 1)}
              className={`mt-1 justify-between border-t border-border font-bold text-primary ${optionClass(options.length - 1)}`}
            >
              <span>See all {data.total || ""} results for &ldquo;{debounced}&rdquo;</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
