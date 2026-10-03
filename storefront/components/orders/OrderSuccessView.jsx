"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { CheckCircle } from "lucide-react";
import Image from "next/image";
import { buttonClass } from "@/components/ui/Button";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { clearCart } from "@/store/slices/cartSlice";
import CatMascot from "@/components/ui/CatMascot";

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
    <div className="container max-w-xl py-8 sm:py-16">
      <div className="flex flex-col items-center rounded-3xl bg-tint px-6 py-12 text-center">
        <CatMascot size={150} />
        <CheckCircle className="mt-4 h-12 w-12 text-success" aria-hidden="true" />
        <h1 className="text-display mt-3">Order placed!</h1>
        <p className="mt-2 text-muted-foreground">Thank you for shopping with Premium Gadget. We are processing your order and will call you to confirm.</p>
        {ref && (
          <p className="mt-4 rounded-full bg-background px-5 py-2 text-sm">
            Order reference <strong className="font-display">#{ref}</strong>
          </p>
        )}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {ref ? (
            <Link href={`/orders/${ref}`} className={buttonClass()}>View order &amp; track</Link>
          ) : (
            <Link href="/orders" className={buttonClass()}>View my orders</Link>
          )}
          <Link href="/products" className={buttonClass({ variant: "outline" })}>Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}
