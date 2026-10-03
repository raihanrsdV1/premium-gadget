"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, Package, Truck, XCircle, Loader2, AlertCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getMyOrder } from "@/lib/api/orders";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Fulfilment timeline for a normal (non-cancelled) order.
const TIMELINE = [
  { key: "pending", label: "Placed", Icon: Clock },
  { key: "confirmed", label: "Confirmed", Icon: CheckCircle },
  { key: "processing", label: "Processing", Icon: Package },
  { key: "shipped", label: "Shipped", Icon: Truck },
  { key: "delivered", label: "Delivered", Icon: CheckCircle },
];
const STEP_INDEX = { pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4 };

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  shipped: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
  delivered: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  returned: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
};

export default function OrderDetailView({ orderNumber }) {
  const ready = useRequireAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getMyOrder(orderNumber)
      .then((o) => active && setOrder(o))
      .catch((e) => active && setError(e.status === 404 ? "Order not found." : "Could not load this order."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ready, orderNumber]);

  if (!ready || loading) {
    return (
      <div className="container py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-24 flex flex-col items-center justify-center text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" aria-hidden="true" />
        <p className="text-muted-foreground mb-6">{error}</p>
        <Link href="/orders" className={buttonClass({ variant: "outline" })}>Back to my orders</Link>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled" || order.status === "returned";
  const currentStep = STEP_INDEX[order.status] ?? 0;

  return (
    <div className="container max-w-3xl py-5 sm:py-10">
      <Link href="/orders" className="mb-5 inline-flex items-center text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" /> My orders
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Order #{order.order_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Placed on {formatDate(order.created_at)}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold capitalize ${STATUS_BADGE[order.status] || STATUS_BADGE.pending}`}>
          {order.status}
        </span>
      </div>

      {/* Tracking timeline */}
      <Card className="mb-5">
        <CardContent className="p-5 sm:p-6">
          <h2 className="mb-6 font-display text-lg font-bold">Order status</h2>
          {isCancelled ? (
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="h-6 w-6" aria-hidden="true" />
              <div>
                <p className="font-bold capitalize">{order.status}</p>
                <p className="text-sm text-muted-foreground">This order was {order.status} and stock was released.</p>
              </div>
            </div>
          ) : (
            <ol className="relative">
              <div className="absolute left-4 right-4 top-4 h-0.5 bg-muted" aria-hidden="true" />
              <div
                className="absolute left-4 top-4 h-0.5 bg-primary transition-all duration-500"
                style={{ width: `calc((100% - 2rem) * ${currentStep / (TIMELINE.length - 1)})` }}
                aria-hidden="true"
              />
              <div className="relative flex justify-between">
                {TIMELINE.map((s, i) => {
                  const done = i <= currentStep;
                  const active = i === currentStep;
                  return (
                    <li key={s.key} className="flex flex-col items-center gap-2" aria-current={active ? "step" : undefined}>
                      <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-background text-muted-foreground"} ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                        <s.Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <span className={`text-center text-[11px] font-bold sm:text-xs ${done ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
                    </li>
                  );
                })}
              </div>
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-5">
        <CardContent className="p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Items</h2>
          <ul className="divide-y divide-border">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-bold">{item.product_name}</p>
                  {item.variant_name && <p className="text-xs text-muted-foreground">{item.variant_name}</p>}
                  <p className="text-xs text-muted-foreground">Qty {item.quantity} × {formatCurrency(item.unit_price)}</p>
                </div>
                <span className="shrink-0 font-semibold">{formatCurrency(item.total_price)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="bg-tint">
        <CardContent className="space-y-2 p-5 text-sm sm:p-6">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold">{formatCurrency(order.subtotal)}</span></div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-semibold text-success">−{formatCurrency(order.discount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="font-semibold">{formatCurrency(order.shipping_fee)}</span></div>
          <div className="flex justify-between border-t border-border pt-3 text-base font-bold"><span>Total</span><span className="font-display font-extrabold text-primary">{formatCurrency(order.total_amount)}</span></div>
          {order.customer_note && <p className="pt-3 text-xs text-muted-foreground">{order.customer_note}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
