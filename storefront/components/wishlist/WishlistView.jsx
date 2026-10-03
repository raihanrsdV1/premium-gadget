"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { ShoppingCart, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import CatEmpty from "@/components/ui/CatEmpty";
import Img from "@/components/ui/Img";
import { formatBDT } from "@/lib/seo";

const FALLBACK = "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400";
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
      <div className="container py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-2xl py-10 sm:py-16">
        <CatEmpty title="We couldn't load your wishlist" text={error} action={{ href: "/products", label: "Browse products" }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container max-w-2xl py-10 sm:py-16">
        <CatEmpty title="Your wishlist is empty" text="Tap the heart on any product to save it here for later." action={{ href: "/products", label: "Browse products" }} />
      </div>
    );
  }

  return (
    <div className="container py-5 sm:py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display">My wishlist</h1>
          <p className="mt-1 text-muted-foreground">{items.length} saved item{items.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/products" className="hidden text-sm font-bold text-primary hover:underline sm:block">
          Continue shopping <ArrowRight className="inline h-4 w-4" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const isNew = String(item.condition).toLowerCase() === "new";
          return (
            <li key={item.id}>
              <Card className="group flex h-full flex-col overflow-hidden">
                <div className="relative aspect-[4/3] overflow-hidden bg-white dark:bg-[#EEF2FF]">
                  <Link href={`/products/${item.slug}`} className="absolute inset-0" aria-label={item.name} tabIndex={-1}>
                    <Img src={item.image || FALLBACK} alt="" fill sizes="(min-width: 1024px) 22vw, 46vw" className="object-cover object-center transition-transform duration-300 motion-safe:group-hover:scale-[1.04]" />
                  </Link>
                  {item.condition && (
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${isNew ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                      {item.condition}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(item.product_id)}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-rose-600 shadow-card hover:bg-rose-50"
                    aria-label={`Remove ${item.name} from wishlist`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <CardContent className="flex flex-1 flex-col p-3 sm:p-4">
                  {item.brand && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.brand}</p>}
                  <Link href={`/products/${item.slug}`}>
                    <h2 className="mb-2 line-clamp-2 font-display text-sm font-bold leading-snug hover:text-primary">{item.name}</h2>
                  </Link>
                  <p className="mb-4 mt-auto font-display text-lg font-extrabold">{formatBDT(item.price)}</p>
                  <Button className="w-full" size="sm" variant="navy" onClick={() => handleAddToCart(item)}>
                    <ShoppingCart className="h-4 w-4" /> Add to cart
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
