"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addProductToCart } from "@/lib/cart";

/**
 * Reusable client button for listing grids (Home featured, search results).
 * The surrounding card is a Server Component and only knows the product, so
 * this resolves the variant before adding: single-variant products add that
 * variant; multi-variant products route to the product page to choose.
 */
export default function AddToCartButton({
  product,
  className,
  variant = "default",
  size = "default",
  label = "Add to Cart",
}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const [state, setState] = useState("idle"); // idle | loading | added | oos

  const onClick = async () => {
    setState("loading");
    try {
      const result = await addProductToCart(
        { productId: product.id, slug: product.slug, name: product.name, image: product.image },
        dispatch,
        router
      );
      if (result === "added") {
        setState("added");
        setTimeout(() => setState("idle"), 1800);
      } else if (result === "out_of_stock") {
        setState("oos");
        setTimeout(() => setState("idle"), 2000);
      } else {
        setState("idle"); // navigating to product page
      }
    } catch {
      setState("idle");
    }
  };

  return (
    <Button className={className} variant={variant} size={size} onClick={onClick} type="button" disabled={state === "loading"}>
      {state === "loading" ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…</>
      ) : state === "added" ? (
        <><Check className="mr-2 h-4 w-4" /> Added!</>
      ) : state === "oos" ? (
        "Out of stock"
      ) : (
        <><ShoppingCart className="mr-2 h-4 w-4" /> {label}</>
      )}
    </Button>
  );
}
