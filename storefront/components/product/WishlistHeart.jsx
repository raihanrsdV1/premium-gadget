"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { addToWishlist, removeFromWishlist } from "@/lib/api/wishlist";

/** Compact heart for product cards. Sends signed-out visitors to /login. */
export default function WishlistHeart({ productId, name = "product", className = "" }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }
    setBusy(true);
    try {
      if (saved) await removeFromWishlist(productId);
      else await addToWishlist(productId);
      setSaved(!saved);
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Heart className={`h-[18px] w-[18px] ${saved ? "fill-coral text-coral" : ""}`} aria-hidden="true" />
    </button>
  );
}
