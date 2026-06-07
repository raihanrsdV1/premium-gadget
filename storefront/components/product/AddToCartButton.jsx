"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addItem } from "@/store/slices/cartSlice";

/**
 * Reusable client button that adds a product (or variant) to the cart.
 * Used by listing grids (Home featured, search results) where the surrounding
 * card is a Server Component.
 */
export default function AddToCartButton({
  product,
  quantity = 1,
  className,
  variant = "default",
  size = "default",
  label = "Add to Cart",
}) {
  const dispatch = useDispatch();
  const [added, setAdded] = useState(false);

  const onClick = () => {
    dispatch(
      addItem({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        image: product.image || "",
        slug: product.slug || "",
        variantName: product.variantName || "",
        quantity,
      })
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <Button className={className} variant={variant} size={size} onClick={onClick} type="button">
      {added ? (
        <><Check className="mr-2 h-4 w-4" /> Added!</>
      ) : (
        <><ShoppingCart className="mr-2 h-4 w-4" /> {label}</>
      )}
    </Button>
  );
}
