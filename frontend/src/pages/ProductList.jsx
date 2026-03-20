import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Filter, SlidersHorizontal, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useGetProductsQuery } from '../store/api/productApi';

const BRANDS = ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Samsung', 'Logitech'];

const ProductList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const navigate = useNavigate();

  const activeCategory = searchParams.get('category') || '';
  const condition      = searchParams.get('condition') || '';
  const activeBrand    = searchParams.get('brand') || '';
  const page           = parseInt(searchParams.get('page') || '1', 10);

  // Build API query params — only include non-empty values
  const queryParams = {
    page,
    limit: 12,
    ...(activeCategory && { category: activeCategory }),
    ...(condition      && { condition }),
    ...(activeBrand    && { brand: activeBrand }),
  };

  const { data: apiData, isLoading, isError } = useGetProductsQuery(queryParams);

  const products   = apiData?.data       || [];
  const pagination = apiData?.pagination || null;

  const toggleFilter = (key, value) => {
    const p = new URLSearchParams(searchParams);
    p.delete('page'); // reset to page 1 on filter change
    if (p.get(key) === value) p.delete(key);
    else p.set(key, value);
    setSearchParams(p);
  };

  const goToPage = (newPage) => {
    const p = new URLSearchParams(searchParams);
    p.set('page', newPage);
    setSearchParams(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const heading = activeCategory
    ? activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)
    : condition === 'used' ? 'Pre-Owned' : 'All Products';

  return (
    <div className="container px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center text-sm text-muted-foreground mb-4 gap-1">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground">{heading}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
            {pagination && (
              <p className="text-muted-foreground mt-1 text-sm">{pagination.total} products found</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="lg:hidden" onClick={() => setIsMobileFiltersOpen(v => !v)}>
              <Filter className="mr-2 h-4 w-4" /> Filters
            </Button>
            <div className="relative">
              <select className="appearance-none bg-background border border-input rounded-md px-4 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
                <option>Sort: Featured</option>
                <option>Price: Low to High</option>
                <option>Price: High to Low</option>
                <option>Newest</option>
              </select>
              <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">

        {/* Sidebar Filters */}
        <aside className={`${isMobileFiltersOpen ? 'block' : 'hidden'} lg:block w-full lg:w-56 shrink-0 space-y-6`}>
          <div className="flex items-center gap-2 mb-2">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="font-semibold text-sm">Filters</span>
          </div>

          {/* Condition */}
          <div>
            <h4 className="text-sm font-medium mb-3">Condition</h4>
            <div className="space-y-2">
              {[{ label: 'New', value: 'new' }, { label: 'Pre-Owned', value: 'used' }].map(({ label, value }) => (
                <label
                  key={value}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => toggleFilter('condition', value)}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${condition === value ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary'}`}>
                    {condition === value && <Check className="h-3 w-3" />}
                  </div>
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div>
            <h4 className="text-sm font-medium mb-3">Brand</h4>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {BRANDS.map(brand => (
                <label
                  key={brand}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={e => { e.preventDefault(); toggleFilter('brand', brand); }}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${activeBrand === brand ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary'}`}>
                    {activeBrand === brand && <Check className="h-3 w-3" />}
                  </div>
                  <span className="text-sm">{brand}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Price range */}
          <div>
            <h4 className="text-sm font-medium mb-3">Price Range (৳)</h4>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                className="h-8 text-xs"
              />
              <span className="text-muted-foreground shrink-0">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" variant="secondary" className="w-full mt-2">Apply</Button>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mb-3" />
              <p className="font-semibold mb-1">Could not load products</p>
              <p className="text-sm text-muted-foreground">Make sure the backend is running.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="font-semibold mb-1">No products found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters.</p>
              <Button variant="outline" className="mt-4" onClick={() => setSearchParams({})}>Clear Filters</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {products.map(product => (
                  <Card
                    key={product.id}
                    onClick={() => navigate(`/products/${product.slug}`)}
                    className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:shadow-lg flex flex-col cursor-pointer"
                  >
                    <div className="relative aspect-square overflow-hidden bg-white p-4">
                      {product.condition === 'Pre-Owned' || product.condition === 'used' ? (
                        <span className="absolute top-2 left-2 z-10 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">
                          Pre-Owned
                        </span>
                      ) : null}
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400'}
                        alt={product.name}
                        className="object-contain w-full h-full transition-transform duration-500 group-hover:scale-105"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400'; }}
                      />
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col">
                      {product.brand && (
                        <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">{product.brand}</div>
                      )}
                      <h3 className="font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors text-sm leading-snug">
                        {product.name}
                      </h3>
                      <div className="mt-auto pt-3">
                        <span className="text-base font-bold">৳{Number(product.price).toLocaleString()}</span>
                        {product.compare_at_price && (
                          <span className="ml-2 text-sm text-muted-foreground line-through">
                            ৳{Number(product.compare_at_price).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                    <div className="px-4 pb-4">
                      <Button className="w-full" variant="secondary" size="sm">View Details</Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2 flex-wrap">
                  <Button
                    variant="outline" size="sm"
                    disabled={!pagination.hasPrev}
                    onClick={() => goToPage(page - 1)}
                  >
                    Previous
                  </Button>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                    <Button
                      key={p}
                      variant="outline" size="sm"
                      className={p === page ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="outline" size="sm"
                    disabled={!pagination.hasNext}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductList;
