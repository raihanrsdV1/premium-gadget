import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

const DUMMY_PRODUCTS = [
  ...Array(8).fill(0).map((_, i) => ({
    id: `prod-${i}`,
    name: i % 2 === 0 ? `MacBook Pro 14" M3 (2023)` : `Lenovo ThinkPad X1 Carbon Gen 11`,
    slug: `product-${i}`,
    price: 150000 + (Math.random() * 100000),
    compareAtPrice: i % 3 === 0 ? 300000 : null,
    image: i % 2 === 0 
      ? 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=600'
      : 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&q=80&w=600',
    condition: i % 4 === 0 ? 'used' : 'new',
    brand: i % 2 === 0 ? 'Apple' : 'Lenovo'
  }))
];

const BRANDS = ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Sony'];

const ProductList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const activeCategory = searchParams.get('category') || 'All';
  const condition = searchParams.get('condition') || 'all';

  const toggleFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (newParams.get(key) === value) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
  };

  return (
    <div className="container px-4 py-8">
      {/* Header & Breadcrumbs */}
      <div className="mb-8">
        <div className="flex items-center text-sm text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground capitalize">{activeCategory} Products</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight capitalize">{activeCategory === 'All' ? 'All Products' : activeCategory}</h1>
            <p className="text-muted-foreground mt-2">Explore our collection of premium gadgets.</p>
          </div>
          <div className="flex items-center space-x-2">
             <Button variant="outline" className="lg:hidden" onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}>
               <Filter className="mr-2 h-4 w-4" /> Filters
             </Button>
             <div className="relative inline-block text-left">
                <select className="appearance-none bg-background border border-input rounded-md px-4 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
                   <option>Sort by: Featured</option>
                   <option>Price: Low to High</option>
                   <option>Price: High to Low</option>
                   <option>Newest Arrivals</option>
                </select>
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
             </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar Filters */}
        <aside className={`${isMobileFiltersOpen ? 'block' : 'hidden'} lg:block w-full lg:w-64 shrink-0 space-y-8`}>
          <div>
            <h3 className="font-semibold mb-4 flex items-center"><SlidersHorizontal className="h-4 w-4 mr-2"/> Filters</h3>
            
            {/* Condition Filter */}
            <div className="mb-6">
              <h4 className="text-sm font-medium mb-3">Condition</h4>
              <div className="space-y-2">
                {['new', 'used'].map(cond => (
                  <label key={cond} className="flex items-center space-x-2 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${condition === cond ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary'}`}>
                       {condition === cond && <Check className="h-3 w-3" />}
                    </div>
                    <span className="text-sm capitalize" onClick={() => toggleFilter('condition', cond)}>{cond === 'used' ? 'Pre-Owned' : 'New'}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Brands Filter */}
            <div className="mb-6">
              <h4 className="text-sm font-medium mb-3">Brand</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {BRANDS.map(brand => {
                  const isActive = searchParams.get('brand') === brand;
                  return (
                  <label key={brand} className="flex items-center space-x-2 cursor-pointer group" onClick={(e) => { e.preventDefault(); toggleFilter('brand', brand); }}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isActive ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary'}`}>
                       {isActive && <Check className="h-3 w-3" />}
                    </div>
                    <span className="text-sm">{brand}</span>
                  </label>
                )})}
              </div>
            </div>

            {/* Price Filter (Visual) */}
            <div>
              <h4 className="text-sm font-medium mb-3">Price Range</h4>
              <div className="flex items-center space-x-2">
                 <Input type="number" placeholder="Min" className="h-8 text-xs" />
                 <span className="text-muted-foreground">-</span>
                 <Input type="number" placeholder="Max" className="h-8 text-xs" />
              </div>
              <Button size="sm" variant="secondary" className="w-full mt-3">Apply</Button>
            </div>
            
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {DUMMY_PRODUCTS.map(product => (
               <Card key={product.id} className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:shadow-lg flex flex-col">
                  <div className="relative aspect-square overflow-hidden bg-white p-4">
                     {product.condition === 'used' && (
                       <span className="absolute top-2 left-2 z-10 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">
                         Pre-Owned
                       </span>
                     )}
                     <img 
                       src={product.image} 
                       alt={product.name}
                       className="object-contain w-full h-full transition-transform duration-500 group-hover:scale-105"
                     />
                  </div>
                  <CardContent className="p-5 flex-1 flex flex-col pt-4">
                     <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">{product.brand}</div>
                     <h3 className="font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                       <Link to={`/products/${product.slug}`}>
                         {product.name}
                       </Link>
                     </h3>
                     <div className="mt-auto pt-4 flex items-center justify-between">
                       <div>
                         <span className="text-lg font-bold text-foreground">৳{Math.floor(product.price).toLocaleString()}</span>
                         {product.compareAtPrice && (
                           <span className="ml-2 text-sm text-muted-foreground line-through">
                             ৳{Math.floor(product.compareAtPrice).toLocaleString()}
                           </span>
                         )}
                       </div>
                     </div>
                  </CardContent>
                  <div className="px-5 pb-5 opacity-0 group-hover:opacity-100 transition-opacity">
                     <Button className="w-full" variant="secondary">View Details</Button>
                  </div>
               </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-12 flex items-center justify-center space-x-2">
             <Button variant="outline" size="sm" disabled>Previous</Button>
             <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">1</Button>
             <Button variant="outline" size="sm">2</Button>
             <Button variant="outline" size="sm">3</Button>
             <span className="text-muted-foreground">...</span>
             <Button variant="outline" size="sm">Next</Button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProductList;
