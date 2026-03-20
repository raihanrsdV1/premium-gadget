import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star, ShieldCheck, Truck, RotateCcw, Check, ShoppingCart } from 'lucide-react';
import { Button } from '../components/ui/Button';

// Mock structured data that matches our real schema plan
const MOCK_PRODUCT = {
  id: 'prod-1',
  name: 'Apple MacBook Pro 14" (M3 Pro, 2023)',
  slug: 'macbook-pro-14-m3-pro-2023',
  brand: 'Apple',
  condition: 'new',
  short_description: 'The most advanced Mac ever. Supercharged by M3 Pro for pro performance.',
  description_md: '## Overpowering performance\n\nThe MacBook Pro blasts forward with the M3 Pro...',
  key_features: [
    'Apple M3 Pro chip with 11-core CPU and 14-core GPU',
    'Liquid Retina XDR display with ProMotion',
    'Up to 18 hours battery life',
    'MagSafe 3, three Thunderbolt 4 ports, SDXC card slot, HDMI port'
  ],
  specifications: [
    { key: 'Processor', value: 'Apple M3 Pro (11-core)' },
    { key: 'Display', value: '14.2-inch Liquid Retina XDR (3024x1964)' },
    { key: 'Memory', value: '18GB Unified Memory' },
    { key: 'Storage', value: '512GB SSD' },
    { key: 'OS', value: 'macOS Sonoma' }
  ],
  variants: [
    { id: 'v1', sku: 'MBP14-M3P-18-512-SV', variant_name: 'Silver / 18GB / 512GB', color: 'Silver', price: 245000, attributes: { RAM: '18GB', Storage: '512GB' } },
    { id: 'v2', sku: 'MBP14-M3P-18-512-SB', variant_name: 'Space Black / 18GB / 512GB', color: 'Space Black', price: 245000, attributes: { RAM: '18GB', Storage: '512GB' } },
    { id: 'v3', sku: 'MBP14-M3P-18-1TB-SB', variant_name: 'Space Black / 18GB / 1TB', color: 'Space Black', price: 275000, attributes: { RAM: '18GB', Storage: '1TB' } },
  ],
  images: [
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=1000',
    'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&q=80&w=1000'
  ]
};

const ProductDetail = () => {
  const { slug } = useParams();
  const product = MOCK_PRODUCT;
  
  // State for variant selection
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(product.variants[0]);

  // Extract unique attribute options for selection
  const colors = [...new Set(product.variants.map(v => v.color).filter(Boolean))];
  const storages = [...new Set(product.variants.map(v => v.attributes.Storage).filter(Boolean))];

  return (
    <div className="container px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm text-muted-foreground mb-8">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <Link to="/products" className="hover:text-foreground">Laptops</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        
        {/* Images Selection */}
        <div className="space-y-4">
          <div className="aspect-[4/3] bg-white rounded-2xl border overflow-hidden flex items-center justify-center p-8">
             <img src={product.images[activeImage]} alt={product.name} className="object-contain max-h-full max-w-full" />
          </div>
          <div className="flex space-x-4 overflow-x-auto pb-2">
            {product.images.map((img, idx) => (
              <button 
                key={idx} 
                onClick={() => setActiveImage(idx)}
                className={`flex-shrink-0 w-20 h-20 rounded-lg border bg-white overflow-hidden p-2 transition-all ${activeImage === idx ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/50'}`}
              >
                 <img src={img} alt="" className="object-contain w-full h-full" />
              </button>
            ))}
          </div>
        </div>

        {/* Product Info & Cart Actions */}
        <div className="flex flex-col">
           {product.condition === 'used' && (
             <div className="mb-4 inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 w-fit">
               Pre-Owned Certified
             </div>
           )}
           <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{product.name}</h1>
           <div className="flex items-center space-x-4 mb-6 text-sm">
              <span className="text-muted-foreground hover:text-foreground cursor-pointer underline underline-offset-4">Brand: {product.brand}</span>
              <div className="flex items-center">
                 <Star className="h-4 w-4 fill-amber-400 text-amber-400 mr-1" />
                 <span className="font-medium mr-1">4.9</span>
                 <span className="text-muted-foreground underline cursor-pointer">(12 reviews)</span>
              </div>
           </div>

           <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
             {product.short_description}
           </p>

           <div className="text-4xl font-bold text-foreground mb-8">
              ৳{selectedVariant.price.toLocaleString()}
              {selectedVariant.compareAtPrice && (
                 <span className="text-xl text-muted-foreground line-through ml-3 font-medium">
                   ৳{selectedVariant.compareAtPrice.toLocaleString()}
                 </span>
              )}
           </div>

           {/* Variant Selection (Color / Storage) */}
           <div className="space-y-6 mb-8 pb-8 border-b">
              {colors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Color: <span className="text-muted-foreground">{selectedVariant.color}</span></h3>
                  <div className="flex flex-wrap gap-3">
                     {colors.map(color => {
                       const isSelected = selectedVariant.color === color;
                       return (
                         <button 
                           key={color}
                           onClick={() => setSelectedVariant(product.variants.find(v => v.color === color && v.attributes.Storage === selectedVariant.attributes.Storage) || product.variants.find(v => v.color === color))}
                           className={`px-4 py-2 text-sm font-medium rounded-md border transition-all ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:border-foreground/50'}`}
                         >
                           {color}
                         </button>
                       )
                     })}
                  </div>
                </div>
              )}
              {storages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Storage: <span className="text-muted-foreground">{selectedVariant.attributes.Storage}</span></h3>
                  <div className="flex flex-wrap gap-3">
                     {storages.map(storage => {
                       const isSelected = selectedVariant.attributes.Storage === storage;
                       // Check if this storage is available in current color
                       const availableVariant = product.variants.find(v => v.color === selectedVariant.color && v.attributes.Storage === storage);
                       
                       return (
                         <button 
                           key={storage}
                           disabled={!availableVariant}
                           onClick={() => availableVariant && setSelectedVariant(availableVariant)}
                           className={`px-4 py-2 text-sm font-medium rounded-md border transition-all ${!availableVariant ? 'opacity-50 cursor-not-allowed bg-muted' : isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input hover:border-foreground/50'}`}
                         >
                           {storage}
                         </button>
                       )
                     })}
                  </div>
                </div>
              )}
           </div>

           {/* Add to Cart */}
           <div className="flex gap-4 mb-8">
             <div className="flex w-32 border rounded-md">
                <button className="flex-1 hover:bg-muted font-medium text-lg focus:outline-none">-</button>
                <div className="flex-1 flex items-center justify-center font-medium border-x">1</div>
                <button className="flex-1 hover:bg-muted font-medium text-lg focus:outline-none">+</button>
             </div>
             <Button size="lg" className="flex-1 text-base font-semibold">
               <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
             </Button>
           </div>
           
           {/* Trust Badges */}
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground bg-secondary/30 p-4 rounded-xl">
             <div className="flex items-center"><ShieldCheck className="h-5 w-5 mr-3 text-primary shrink-0"/> 1 Year Official Warranty</div>
             <div className="flex items-center"><Truck className="h-5 w-5 mr-3 text-primary shrink-0"/> Free Nationwide Delivery</div>
             <div className="flex items-center"><RotateCcw className="h-5 w-5 mr-3 text-primary shrink-0"/> 7 Days Easy Return</div>
             <div className="flex items-center"><Check className="h-5 w-5 mr-3 text-primary shrink-0"/> 100% Genuine Product</div>
           </div>
        </div>
      </div>

      {/* Product Details Tabs (Specs, Features, MD) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 pt-12 border-t mt-16">
         <div className="lg:col-span-2 space-y-12">
            <div>
              <h2 className="text-2xl font-bold mb-6 tracking-tight">Key Features</h2>
              <ul className="space-y-3">
                 {product.key_features.map((feature, idx) => (
                   <li key={idx} className="flex items-start">
                     <Check className="h-5 w-5 text-primary mr-3 mt-0.5 shrink-0" />
                     <span className="text-lg">{feature}</span>
                   </li>
                 ))}
              </ul>
            </div>
            
            <div className="prose dark:prose-invert max-w-none">
               <h2 className="text-2xl font-bold mb-6 tracking-tight not-prose">Overview</h2>
               <p>The MacBook Pro blasts forward with the M3 Pro and M3 Max chips. Built on 3‑nanometer technology and featuring an all-new GPU architecture...</p>
               <p>(Markdown rendering goes here based on `description_md` field)</p>
            </div>
         </div>

         {/* Specifications Table */}
         <div>
            <div className="sticky top-24 bg-background rounded-xl border p-6 shadow-sm">
               <h2 className="text-xl font-bold mb-6 tracking-tight">Tech Specs</h2>
               <div className="divide-y text-sm">
                 {product.specifications.map((spec, idx) => (
                   <div key={idx} className="grid grid-cols-3 py-3 gap-4">
                     <span className="text-muted-foreground font-medium">{spec.key}</span>
                     <span className="col-span-2 text-foreground">{spec.value}</span>
                   </div>
                 ))}
               </div>
            </div>
         </div>
      </div>

    </div>
  );
};

export default ProductDetail;
