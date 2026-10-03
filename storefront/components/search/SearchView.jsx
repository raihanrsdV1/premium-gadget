"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import CatEmpty from "@/components/ui/CatEmpty";
import ProductCard from "@/components/product/ProductCard";
import { useDebounce } from "@/hooks/useDebounce";
import { searchProducts } from "@/lib/api/products";

const SORT_OPTIONS = [
  { value: "relevance", label: "Most Relevant" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

/**
 * Live product search. Replaces the legacy SearchPage, which filtered a
 * hardcoded MOCK_PRODUCTS array and never called the API. This hits the real
 * /products/search endpoint (trigram fuzzy search) with debounced input.
 *
 * Initial results are fetched on the server (SSR) and passed in, so the first
 * paint already shows results; subsequent queries fetch on the client.
 */
export default function SearchView({ initialQuery = "", initialResults = [] }) {
  const router = useRouter();
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("relevance");
  const [conditionFilter, setConditionFilter] = useState("all");

  const debouncedQuery = useDebounce(localQuery, 400);
  const lastFetched = useRef(initialQuery);

  useEffect(() => {
    const term = debouncedQuery.trim();
    let active = true;

    router.replace(term ? `/search?q=${encodeURIComponent(term)}` : "/search", { scroll: false });

    if (term.length < 2) {
      setResults([]);
      lastFetched.current = term;
      return;
    }
    // Already have SSR/last results for this term.
    if (term === lastFetched.current) return;

    setLoading(true);
    searchProducts(term)
      .then((r) => {
        if (active) {
          setResults(r.data);
          lastFetched.current = term;
        }
      })
      .catch(() => active && setResults([]))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const query = debouncedQuery.trim();

  const filtered = useMemo(() => {
    let list = results.filter(
      (p) => conditionFilter === "all" || p.condition === conditionFilter
    );
    if (sort === "price_asc") list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price_desc") list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    return list;
  }, [results, conditionFilter, sort]);

  const clearSearch = () => setLocalQuery("");
  const pill = (on) =>
    `h-9 rounded-full border-[1.5px] px-4 text-sm font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25 hover:bg-accent"}`;

  return (
    <div className="container py-5 sm:py-8">
      <h1 className="text-display mb-4">Search</h1>
      <div className="relative mb-5 max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search laptops, brands, accessories..."
          aria-label="Search products"
          autoFocus
          className="h-12 w-full rounded-full border-[1.5px] border-input bg-card pl-12 pr-12 text-base shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {localQuery && (
          <button type="button" onClick={clearSearch} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {query ? (
            <span><strong className="text-foreground">{filtered.length}</strong> results for &ldquo;{query}&rdquo;</span>
          ) : (
            "Type at least 2 characters to search"
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Condition" className="flex gap-1.5">
            {[["all", "All"], ["New", "New"], ["Pre-Owned", "Pre-owned"]].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={conditionFilter === v} onClick={() => setConditionFilter(v)} className={pill(conditionFilter === v)}>{label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-9 rounded-full border-[1.5px] border-foreground/25 bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {query && filtered.length === 0 && !loading ? (
        <CatEmpty
          title="No results found"
          text="Check the spelling, try a shorter term like a brand or model, or remove the condition filter."
          action={{ href: "/products", label: "Browse all products" }}
          secondary={{ href: "/products?condition=used", label: "See used laptops" }}
        />
      ) : !query ? (
        <CatEmpty title="What are you looking for?" text="Try a brand like HP or Dell, a model like MacBook Air, or a category like charger." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <li key={product.id}><ProductCard product={product} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
