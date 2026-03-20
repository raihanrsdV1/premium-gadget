import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useCart } from '../hooks/useCart';
import { useDebounce } from '../hooks/useDebounce';

const MOCK_PRODUCTS = [
  { id: 1, slug: 'macbook-pro-m3', name: 'MacBook Pro M3 14"', brand: 'Apple', price: 195000, condition: 'New', category: 'laptop', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=80' },
  { id: 2, slug: 'dell-xps-15', name: 'Dell XPS 15 OLED', brand: 'Dell', price: 165000, condition: 'Pre-Owned', category: 'laptop', image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80' },
  { id: 3, slug: 'lenovo-thinkpad-x1', name: 'Lenovo ThinkPad X1 Carbon', brand: 'Lenovo', price: 140000, condition: 'Pre-Owned', category: 'laptop', image: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=400&q=80' },
  { id: 4, slug: 'mx-keys-s', name: 'Logitech MX Keys S', brand: 'Logitech', price: 12500, condition: 'New', category: 'accessory', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80' },
  { id: 5, slug: 'samsung-t7-ssd', name: 'Samsung T7 Portable SSD 1TB', brand: 'Samsung', price: 9800, condition: 'New', category: 'accessory', image: 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=400&q=80' },
  { id: 6, slug: 'hp-envy-15', name: 'HP Envy 15 x360', brand: 'HP', price: 120000, condition: 'Pre-Owned', category: 'laptop', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=80' },
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(amount);

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most Relevant' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
];

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [localQuery, setLocalQuery] = useState(searchParams.get('q') || '');
  const [sort, setSort] = useState('relevance');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const { add } = useCart();

  const debouncedQuery = useDebounce(localQuery, 400);

  useEffect(() => {
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery });
    }
  }, [debouncedQuery]);

  const query = searchParams.get('q') || '';

  const filtered = MOCK_PRODUCTS
    .filter((p) => {
      const matchQuery = !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.brand.toLowerCase().includes(query.toLowerCase());
      const matchCondition = conditionFilter === 'all' || p.condition === conditionFilter;
      return matchQuery && matchCondition;
    })
    .sort((a, b) => {
      if (sort === 'price_asc') return a.price - b.price;
      if (sort === 'price_desc') return b.price - a.price;
      return 0;
    });

  const clearSearch = () => {
    setLocalQuery('');
    setSearchParams({});
  };

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
            className="w-full h-12 pl-10 pr-10 rounded-lg border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {localQuery && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 gap-4">
        <p className="text-sm text-muted-foreground">
          {query ? (
            <><span className="font-semibold text-foreground">{filtered.length}</span> results for &ldquo;{query}&rdquo;</>
          ) : (
            `Showing all ${filtered.length} products`
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
        <aside className={`w-52 shrink-0 space-y-6 ${showFilters ? 'block' : 'hidden md:block'}`}>
          <div>
            <h3 className="text-sm font-semibold mb-3">Condition</h3>
            <div className="space-y-2">
              {['all', 'New', 'Pre-Owned'].map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={conditionFilter === c}
                    onChange={() => setConditionFilter(c)}
                    className="accent-primary"
                  />
                  {c === 'all' ? 'All' : c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-3">Category</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="cursor-pointer hover:text-foreground transition-colors">Laptops</p>
              <p className="cursor-pointer hover:text-foreground transition-colors">Accessories</p>
              <p className="cursor-pointer hover:text-foreground transition-colors">Pre-Owned</p>
            </div>
          </div>
        </aside>

        {/* Results grid */}
        <div className="flex-1">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No results found</h3>
              <p className="text-muted-foreground text-sm">Try a different search term or remove filters.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((product) => (
                <Card key={product.id} className="group overflow-hidden">
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className={`absolute top-3 left-3 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      product.condition === 'New' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {product.condition}
                    </span>
                  </div>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{product.brand}</p>
                    <Link to={`/products/${product.slug}`}>
                      <h3 className="font-semibold text-sm leading-tight hover:text-primary transition-colors line-clamp-2 mb-2">
                        {product.name}
                      </h3>
                    </Link>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">{formatCurrency(product.price)}</span>
                      <Button size="sm" variant="outline" onClick={() => add({ id: product.id, name: product.name, price: product.price })}>
                        Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
