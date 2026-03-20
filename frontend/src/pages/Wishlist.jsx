import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useCart } from '../hooks/useCart';
import { useSelector } from 'react-redux';

const MOCK_WISHLIST = [
  {
    id: 1,
    slug: 'macbook-pro-m3-14-inch',
    name: 'MacBook Pro M3 14"',
    brand: 'Apple',
    price: 195000,
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=80',
    condition: 'New',
    inStock: true,
  },
  {
    id: 2,
    slug: 'dell-xps-15-oled',
    name: 'Dell XPS 15 OLED',
    brand: 'Dell',
    price: 165000,
    image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80',
    condition: 'Pre-Owned',
    inStock: true,
  },
  {
    id: 3,
    slug: 'logitech-mx-keys-s',
    name: 'Logitech MX Keys S',
    brand: 'Logitech',
    price: 12500,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80',
    condition: 'New',
    inStock: false,
  },
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(amount);

const Wishlist = () => {
  const [wishlist, setWishlist] = useState(MOCK_WISHLIST);
  const { add } = useCart();
  const { isAuthenticated } = useSelector((state) => state.auth);

  const removeFromWishlist = (id) => {
    setWishlist((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddToCart = (item) => {
    add({ id: item.id, name: item.name, price: item.price });
    removeFromWishlist(item.id);
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-24 text-center max-w-md mx-auto">
        <Heart className="h-16 w-16 text-muted-foreground/40 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Sign in to view your wishlist</h2>
        <p className="text-muted-foreground mb-8">Save your favorite products and access them anytime.</p>
        <Link to="/login">
          <Button size="lg">Sign In</Button>
        </Link>
      </div>
    );
  }

  if (wishlist.length === 0) {
    return (
      <div className="container py-24 text-center max-w-md mx-auto">
        <Heart className="h-16 w-16 text-muted-foreground/40 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Your wishlist is empty</h2>
        <p className="text-muted-foreground mb-8">Browse our products and save your favorites here.</p>
        <Link to="/products">
          <Button size="lg">
            Browse Products <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Wishlist</h1>
          <p className="text-muted-foreground mt-1">{wishlist.length} saved item{wishlist.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/products" className="text-sm text-primary hover:underline font-medium hidden sm:block">
          Continue Shopping <ArrowRight className="inline h-4 w-4" />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {wishlist.map((item) => (
          <Card key={item.id} className="group overflow-hidden">
            <div className="relative aspect-square overflow-hidden bg-slate-50">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className={`absolute top-3 left-3 text-xs font-semibold px-2 py-1 rounded-full ${
                item.condition === 'New'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {item.condition}
              </span>
              <button
                onClick={() => removeFromWishlist(item.id)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/80 hover:bg-white text-rose-500 transition-colors shadow"
                aria-label="Remove from wishlist"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{item.brand}</p>
              <Link to={`/products/${item.slug}`}>
                <h3 className="font-semibold leading-tight hover:text-primary transition-colors line-clamp-2 mb-2">
                  {item.name}
                </h3>
              </Link>
              <p className="text-lg font-bold text-primary mb-4">{formatCurrency(item.price)}</p>
              <Button
                className="w-full"
                size="sm"
                disabled={!item.inStock}
                onClick={() => handleAddToCart(item)}
                variant={item.inStock ? 'default' : 'outline'}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {item.inStock ? 'Add to Cart' : 'Out of Stock'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Wishlist;
