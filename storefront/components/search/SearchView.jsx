"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  const [showFilters, setShowFilters] = useState(false);

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

  return (
    <div className="container py-8 px-4">
      {/* Search bar */}
      <div className="mb-6">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search products, brands..."
            autoFocus
            className="w-full h-12 pl-10 pr-10 rounded-lg border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {localQuery && (
            <button
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 gap-4">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {query ? (
            <>
              <span className="font-semibold text-foreground">{filtered.length}</span> results for &ldquo;{query}&rdquo;
            </>
          ) : (
            "Type at least 2 characters to search"
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="md:hidden">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <aside className={`w-52 shrink-0 space-y-6 ${showFilters ? "block" : "hidden md:block"}`}>
          <div>
            <h3 className="text-sm font-semibold mb-3">Condition</h3>
            <div className="space-y-2">
              {["all", "New", "Pre-Owned"].map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={conditionFilter === c}
                    onChange={() => setConditionFilter(c)}
                    className="accent-primary"
                  />
                  {c === "all" ? "All" : c}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Results grid */}
        <div className="flex-1 min-w-0">
          {query && filtered.length === 0 && !loading ? (
            <div className="text-center py-20">
              <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No results found</h3>
              <p className="text-muted-foreground text-sm">Try a different search term or remove filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} action="add" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
