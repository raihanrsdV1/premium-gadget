"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, Package, Truck, XCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-violet-100 text-violet-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-red-100 text-red-700",
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
      <div className="container px-4 py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container px-4 py-24 flex flex-col items-center justify-center text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-muted-foreground mb-6">{error}</p>
        <Link href="/orders"><Button variant="outline">Back to My Orders</Button></Link>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled" || order.status === "returned";
  const currentStep = STEP_INDEX[order.status] ?? 0;

  return (
    <div className="container py-10 px-4 max-w-3xl">
      <Link href="/orders" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4 mr-1" /> My Orders
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order #{order.order_number}</h1>
          <p className="text-muted-foreground text-sm mt-1">Placed on {formatDate(order.created_at)}</p>
        </div>
        <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_BADGE[order.status] || STATUS_BADGE.pending}`}>
          {order.status}
        </span>
      </div>

      {/* Tracking timeline */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-semibold text-lg mb-6">Order Status</h2>
          {isCancelled ? (
            <div className="flex items-center gap-3 text-destructive">
              <XCircle className="h-6 w-6" />
              <div>
                <p className="font-medium capitalize">{order.status}</p>
                <p className="text-sm text-muted-foreground">This order was {order.status} and stock was released.</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted" />
              <div
                className="absolute top-4 left-4 h-0.5 bg-primary transition-all duration-500"
                style={{ width: `${(currentStep / (TIMELINE.length - 1)) * 100}%` }}
              />
              <div className="relative flex justify-between">
                {TIMELINE.map((s, i) => {
                  const done = i <= currentStep;
                  const active = i === currentStep;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 transition-colors ${done ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted-foreground/30 text-muted-foreground"} ${active ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                        <s.Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-xs font-medium text-center ${done ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-semibold text-lg mb-4">Items</h2>
          <div className="divide-y">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  {item.variant_name && <p className="text-muted-foreground text-xs">{item.variant_name}</p>}
                  <p className="text-muted-foreground text-xs">Qty {item.quantity} × {formatCurrency(item.unit_price)}</p>
                </div>
                <span className="font-medium">{formatCurrency(item.total_price)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="p-6 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatCurrency(order.subtotal)}</span></div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-medium text-green-600">−{formatCurrency(order.discount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="font-medium">{formatCurrency(order.shipping_fee)}</span></div>
          <div className="flex justify-between pt-2 border-t text-base font-bold"><span>Total</span><span className="text-primary">{formatCurrency(order.total_amount)}</span></div>
          {order.customer_note && <p className="text-xs text-muted-foreground pt-3">{order.customer_note}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
