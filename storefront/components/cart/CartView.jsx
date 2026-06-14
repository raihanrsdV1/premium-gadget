"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ArrowRight, ShieldCheck } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { setQuantity, removeItem, deleteItem, clearCart } from "@/store/slices/cartSlice";

// Ported from frontend/src/pages/CartPage.jsx, wired to the storefront cart slice.
export default function CartView() {
  const { items, totalAmount, totalQuantity } = useSelector((state) => state.cart);
  const dispatch = useDispatch();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div className="container px-4 py-24 flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 text-muted-foreground">
          <Trash2 className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-bold mb-4 tracking-tight">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          Looks like you haven&apos;t added any products to your cart yet. Explore our collections and find something you love.
        </p>
        <Link href="/products">
          <Button size="lg">Continue Shopping <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 tracking-tight">Shopping Cart ({totalQuantity} items)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden border-border/50">
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-6">
                <div className="w-full sm:w-32 h-32 bg-white rounded-lg border p-2 shrink-0 flex items-center justify-center">
                  <img
                    src={item.image || "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=200"}
                    alt={item.name}
                    className="object-contain max-h-full max-w-full"
                  />
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <Link href={`/products/${item.slug || ""}`} className="font-semibold text-lg hover:text-primary transition-colors line-clamp-2">
                        {item.name}
                      </Link>
                      <div className="text-sm text-muted-foreground mt-1">{item.variantName || "Standard Variant"}</div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-bold text-lg">৳{item.totalPrice.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">৳{item.price.toLocaleString()} each</div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center border rounded-md h-9 w-fit">
                        <button
                          className="px-3 h-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => dispatch(removeItem(item.id))}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          className="px-3 h-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          onClick={() => dispatch(setQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                          disabled={item.maxStock != null && item.quantity >= item.maxStock}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {item.maxStock != null && item.quantity >= item.maxStock && (
                        <span className="text-xs text-orange-600">Max available: {item.maxStock}</span>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => dispatch(deleteItem(item.id))}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Remove
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-between items-center pt-4">
            <Link href="/products" className="text-sm font-medium text-primary hover:underline">
              ← Continue Shopping
            </Link>
            <Button variant="outline" size="sm" onClick={() => dispatch(clearCart())}>Clear Cart</Button>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-primary/20 bg-secondary/10">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-6">Order Summary</h2>
              <div className="space-y-4 mb-6 text-sm">
                <div className="flex justify-between border-b pb-4">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">৳{totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b pb-4">
                  <span className="text-muted-foreground">Shipping Estimate</span>
                  <span className="font-medium">Calculated at checkout</span>
                </div>
                <div className="flex justify-between border-b pb-4">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">Included</span>
                </div>
                <div className="flex justify-between pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">৳{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-4">
                <Button size="lg" className="w-full text-base" onClick={() => router.push("/checkout")}>
                  Proceed to Checkout <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <div className="bg-background border rounded-lg p-3 flex items-start space-x-3 mt-4 text-xs text-muted-foreground">
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p>Secure checkout powered by SSL Commerz. Your data is protected.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
