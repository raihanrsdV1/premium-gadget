"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ArrowRight, ShieldCheck } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { Button } from "@/components/ui/Button";
import CatEmpty from "@/components/ui/CatEmpty";
import Img from "@/components/ui/Img";
import { setQuantity, removeItem, deleteItem, clearCart } from "@/store/slices/cartSlice";
import { formatBDT } from "@/lib/seo";

const FALLBACK = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=200";

// Ported from frontend/src/pages/CartPage.jsx, wired to the storefront cart slice.
export default function CartView() {
  const { items, totalAmount, totalQuantity } = useSelector((state) => state.cart);
  const dispatch = useDispatch();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div className="container max-w-2xl py-10 sm:py-16">
        <CatEmpty
          title="Your cart is empty"
          text="You haven't added anything yet. Browse our laptops and gadgets and find something you love."
          action={{ href: "/products", label: "Continue shopping" }}
          secondary={{ href: "/products?condition=used", label: "See used laptops" }}
        />
      </div>
    );
  }

  return (
    <div className="container py-5 sm:py-8">
      <h1 className="text-display mb-5 sm:mb-7">Your cart <span className="text-lg font-semibold text-muted-foreground">({totalQuantity} {totalQuantity === 1 ? "item" : "items"})</span></h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-3 sm:space-y-4 lg:col-span-2">
          <ul className="space-y-3 sm:space-y-4">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-card sm:gap-5 sm:p-4">
                <Link href={`/products/${item.slug || ""}`} className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white sm:h-32 sm:w-32 dark:bg-[#EEF2FF]" aria-label={item.name} tabIndex={-1}>
                  <Img src={item.image || FALLBACK} alt="" fill sizes="128px" className="object-contain p-2" />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/products/${item.slug || ""}`} className="line-clamp-2 font-display text-sm font-bold leading-snug hover:text-primary sm:text-base">
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{item.variantName || "Standard"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display text-base font-extrabold sm:text-lg">{formatBDT(item.totalPrice)}</div>
                      <div className="text-xs text-muted-foreground">{formatBDT(item.price)} each</div>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                    <div>
                      <div className="flex h-10 w-fit items-center overflow-hidden rounded-full border-[1.5px] border-foreground/25" role="group" aria-label={`Quantity for ${item.name}`}>
                        <button type="button" className="flex h-full w-10 items-center justify-center hover:bg-accent" onClick={() => dispatch(removeItem(item.id))} aria-label="Decrease quantity">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold" aria-live="polite">{item.quantity}</span>
                        <button
                          type="button"
                          className="flex h-full w-10 items-center justify-center hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
                          onClick={() => dispatch(setQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                          disabled={item.maxStock != null && item.quantity >= item.maxStock}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {item.maxStock != null && item.quantity >= item.maxStock && (
                        <span className="mt-1 block text-xs font-semibold text-destructive">Max available: {item.maxStock}</span>
                      )}
                    </div>

                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => dispatch(deleteItem(item.id))} aria-label={`Remove ${item.name}`}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-2">
            <Link href="/products" className="text-sm font-bold text-primary hover:underline">&larr; Continue shopping</Link>
            <Button variant="outline" size="sm" onClick={() => dispatch(clearCart())}>Clear cart</Button>
          </div>
        </div>

        <aside className="lg:col-span-1" aria-label="Order summary">
          <div className="rounded-3xl border border-border bg-tint p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="mb-5 font-display text-xl font-extrabold">Order summary</h2>
            <dl className="mb-6 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-semibold">{formatBDT(totalAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="font-semibold">Calculated at checkout</dd></div>
              <div className="flex justify-between border-t border-border pt-4 text-lg"><dt className="font-bold">Total</dt><dd className="font-display font-extrabold text-primary">{formatBDT(totalAmount)}</dd></div>
            </dl>
            <Button size="lg" variant="coral" className="w-full" onClick={() => router.push("/checkout")}>
              Proceed to checkout <ArrowRight className="h-5 w-5" />
            </Button>
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-background p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Secure checkout with SSLCommerz, or pay cash on delivery.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
