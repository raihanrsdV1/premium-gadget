"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { clearCart } from "@/store/slices/cartSlice";

// Confirmation page shown after a validated payment. Reads the order reference
// from the query string (?ref=ORD-... or ?order=...) and clears the cart.
export default function OrderSuccessView() {
  const ready = useRequireAuth();
  const params = useSearchParams();
  const dispatch = useDispatch();
  const ref = params.get("ref") || params.get("order");

  // Payment succeeded by the time we reach this page — clear the cart.
  useEffect(() => {
    if (ready) dispatch(clearCart());
  }, [ready, dispatch]);

  if (!ready) return null;

  return (
    <div className="container py-24 text-center px-4">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
      <h1 className="text-4xl font-bold mb-4">Order Placed Successfully!</h1>
      <p className="text-muted-foreground mb-2">Thank you for your purchase. We are processing your order.</p>
      {ref && (
        <p className="text-muted-foreground mb-8">
          Your order reference is <span className="font-semibold text-foreground">#{ref}</span>.
        </p>
      )}
      <div className="flex flex-wrap gap-3 justify-center mt-6">
        {ref ? (
          <Link href={`/orders/${ref}`}><Button>View Order &amp; Track</Button></Link>
        ) : (
          <Link href="/orders"><Button>View My Orders</Button></Link>
        )}
        <Link href="/products"><Button variant="outline">Continue Shopping</Button></Link>
      </div>
    </div>
  );
}
