import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star, ShieldCheck, Truck, RotateCcw, Check, ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useGetProductBySlugQuery } from '../store/api/productApi';
import { useDispatch } from 'react-redux';
import { addItem } from '../store/slices/cartSlice';

const ProductDetail = () => {
  const { slug } = useParams();
  const dispatch = useDispatch();
  const { data, isLoading, isError } = useGetProductBySlugQuery(slug);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (isLoading) {
    return (
      <div className="container px-4 py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="container px-4 py-24 flex flex-col items-center justify-center text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Product Not Found</h2>
        <p className="text-muted-foreground mb-6">This product may no longer be available.</p>
        <Link to="/products"><Button>Browse Products</Button></Link>
      </div>
    );
  }

  const product = data.data;
  const variants = product.variants || [];
  const activeVariant = selectedVariant || variants[0] || null;

  const colors   = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const storages = [...new Set(variants.map(v => v.attributes?.Storage).filter(Boolean))];
  const price = activeVariant?.price ?? product.price ?? 0;

  const handleAddToCart = () => {
    dispatch(addItem({
      id: activeVariant?.id || product.id,
      name: product.name,
      price,
      image: product.images?.[0] || '',
      slug: product.slug,
      variantName: activeVariant?.variant_name || '',
      quantity: qty,
    }));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="container px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm text-muted-foreground mb-8 flex-wrap gap-1">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <Link to="/products" className="hover:text-foreground">Products</Link>
        <span>/</span>
        <span className="text-foreground line-clamp-1">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">

        {/* Images */}
        <div className="space-y-4">
          <div className="aspect-[4/3] bg-white rounded-2xl border overflow-hidden flex items-center justify-center p-8">
            <img
              src={product.images?.[activeImage] || 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=800'}
              alt={product.name}
              className="object-contain max-h-full max-w-full"
            />
          </div>
          {product.images?.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={`shrink-0 w-20 h-20 rounded-lg border bg-white overflow-hidden p-2 transition-all ${activeImage === idx ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/50'}`}
                >
                  <img src={img} alt="" className="object-contain w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          {product.condition === 'used' && (
            <span className="mb-4 inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 w-fit">
              Pre-Owned Certified
            </span>
          )}

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{product.name}</h1>

          <div className="flex items-center gap-4 mb-6 text-sm flex-wrap">
            {product.brand && (
              <span className="text-muted-foreground">Brand: <span className="font-medium text-foreground">{product.brand}</span></span>
            )}
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-medium">4.8</span>
            </div>
          </div>

          {product.short_description && (
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">{product.short_description}</p>
          )}

          <div className="text-4xl font-bold mb-8">
            ৳{price.toLocaleString()}
            {activeVariant?.compare_at_price && (
              <span className="text-xl text-muted-foreground line-through ml-3 font-medium">
                ৳{activeVariant.compare_at_price.toLocaleString()}
              </span>
            )}
          </div>

          {/* Variant selectors */}
          {(colors.length > 0 || storages.length > 0) && (
            <div className="space-y-5 mb-8 pb-8 border-b">
              {colors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">
                    Color: <span className="text-muted-foreground">{activeVariant?.color}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {colors.map(color => (
                      <button
                        key={color}
                        onClick={() => {
                          const v = variants.find(v => v.color === color && v.attributes?.Storage === activeVariant?.attributes?.Storage)
                                 || variants.find(v => v.color === color);
                          if (v) setSelectedVariant(v);
                        }}
                        className={`px-4 py-2 text-sm font-medium rounded-md border transition-all ${activeVariant?.color === color ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:border-foreground/50'}`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {storages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">
                    Storage: <span className="text-muted-foreground">{activeVariant?.attributes?.Storage}</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {storages.map(storage => {
                      const match = variants.find(v => v.color === activeVariant?.color && v.attributes?.Storage === storage);
                      const isSelected = activeVariant?.attributes?.Storage === storage;
                      return (
                        <button
                          key={storage}
                          disabled={!match}
                          onClick={() => match && setSelectedVariant(match)}
                          className={`px-4 py-2 text-sm font-medium rounded-md border transition-all ${!match ? 'opacity-40 cursor-not-allowed bg-muted' : isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:border-foreground/50'}`}
                        >
                          {storage}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Qty + Add to Cart */}
          <div className="flex gap-4 mb-8">
            <div className="flex w-32 border rounded-md overflow-hidden">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="flex-1 hover:bg-muted font-bold text-lg">−</button>
              <div className="flex-1 flex items-center justify-center font-medium border-x">{qty}</div>
              <button onClick={() => setQty(q => q + 1)} className="flex-1 hover:bg-muted font-bold text-lg">+</button>
            </div>
            <Button size="lg" className="flex-1 text-base font-semibold" onClick={handleAddToCart}>
              {added
                ? <><Check className="mr-2 h-5 w-5" /> Added!</>
                : <><ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart</>
              }
            </Button>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground bg-secondary/30 p-4 rounded-xl">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary shrink-0" /> 1 Year Warranty</div>
            <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary shrink-0" /> Free Delivery</div>
            <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary shrink-0" /> 7-Day Return</div>
            <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> 100% Genuine</div>
          </div>
        </div>
      </div>

      {/* Details section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-12 border-t">
        <div className="lg:col-span-2 space-y-12">
          {product.key_features?.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Key Features</h2>
              <ul className="space-y-3">
                {product.key_features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-base">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {product.description && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{product.description}</p>
            </div>
          )}
        </div>

        {product.specifications?.length > 0 && (
          <div>
            <div className="sticky top-24 bg-background rounded-xl border p-6 shadow-sm">
              <h2 className="text-xl font-bold mb-5">Tech Specs</h2>
              <div className="divide-y text-sm">
                {product.specifications.map((spec, i) => (
                  <div key={i} className="grid grid-cols-3 py-3 gap-3">
                    <span className="text-muted-foreground font-medium">{spec.key}</span>
                    <span className="col-span-2">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;
