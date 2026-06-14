"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { Heart, ShoppingCart, Trash2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { addProductToCart } from "@/lib/cart";
import { getWishlist, removeFromWishlist } from "@/lib/api/wishlist";

// Replaces the legacy mock Wishlist with the real (Phase 3) backend endpoints.
export default function WishlistView() {
  const ready = useRequireAuth();
  const dispatch = useDispatch();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getWishlist()
      .then((data) => active && setItems(data))
      .catch(() => active && setError("Could not load your wishlist."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ready]);

  const handleRemove = async (productId) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
    try {
      await removeFromWishlist(productId);
    } catch {
      /* best-effort; reload would resync */
    }
  };

  const handleAddToCart = async (item) => {
    // Resolve to a variant_id (single-variant adds directly; multi-variant
    // routes to the product page to choose).
    const result = await addProductToCart(
      { productId: item.product_id, slug: item.slug, name: item.name, image: item.image },
      dispatch,
      router
    );
    if (result === "added") handleRemove(item.product_id);
  };

  if (!ready || loading) {
    return (
      <div className="container px-4 py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container px-4 py-24 flex flex-col items-center justify-center text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container py-24 text-center max-w-md mx-auto px-4">
        <Heart className="h-16 w-16 text-muted-foreground/40 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Your wishlist is empty</h2>
        <p className="text-muted-foreground mb-8">Browse our products and save your favorites here.</p>
        <Link href="/products">
          <Button size="lg">Browse Products <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Wishlist</h1>
          <p className="text-muted-foreground mt-1">{items.length} saved item{items.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/products" className="text-sm text-primary hover:underline font-medium hidden sm:block">
          Continue Shopping <ArrowRight className="inline h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {items.map((item) => (
          <Card key={item.id} className="group overflow-hidden">
            <div className="relative aspect-square overflow-hidden bg-white p-4">
              <img
                src={item.image || "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400"}
                alt={item.name}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <span className={`absolute top-3 left-3 text-xs font-semibold px-2 py-1 rounded-full ${item.condition === "New" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {item.condition}
              </span>
              <button
                onClick={() => handleRemove(item.product_id)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/80 hover:bg-white text-rose-500 transition-colors shadow"
                aria-label="Remove from wishlist"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <CardContent className="p-4">
              {item.brand && <p className="text-xs text-muted-foreground mb-1">{item.brand}</p>}
              <Link href={`/products/${item.slug}`}>
                <h3 className="font-semibold leading-tight hover:text-primary transition-colors line-clamp-2 mb-2 text-sm">
                  {item.name}
                </h3>
              </Link>
              <p className="text-lg font-bold text-primary mb-4">৳{Number(item.price).toLocaleString()}</p>
              <Button className="w-full" size="sm" onClick={() => handleAddToCart(item)}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
