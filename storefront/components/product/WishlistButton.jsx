"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addToWishlist } from "@/lib/api/wishlist";

/**
 * "Save to Wishlist" button for the product detail page. Requires auth — sends
 * unauthenticated users to /login. Adds via the user-scoped wishlist endpoint.
 */
export default function WishlistButton({ productId }) {
  const router = useRouter();
  const [state, setState] = useState("idle"); // idle | saving | saved

  const onClick = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }
    setState("saving");
    try {
      await addToWishlist(productId);
      setState("saved");
    } catch {
      setState("idle");
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={onClick}
      disabled={state === "saving"}
      aria-label="Save to wishlist"
      title={state === "saved" ? "Saved to wishlist" : "Save to wishlist"}
    >
      {state === "saving" ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Heart className={`h-5 w-5 ${state === "saved" ? "fill-rose-500 text-rose-500" : ""}`} />
      )}
    </Button>
  );
}
