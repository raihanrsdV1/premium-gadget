"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, Clock, CheckCircle, XCircle, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import CatEmpty from "@/components/ui/CatEmpty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getMyOrders } from "@/lib/api/orders";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", Icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300", Icon: Package },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300", Icon: Package },
  shipped: { label: "Shipped", color: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300", Icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300", Icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300", Icon: XCircle },
  returned: { label: "Returned", color: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300", Icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <cfg.Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

export default function OrderHistoryView() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getMyOrders()
      .then((data) => active && setOrders(Array.isArray(data) ? data : []))
      .catch(() => active && setOrders([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ready]);

  if (!ready || loading) {
    return (
      <div className="container py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const filters = ["all", "processing", "shipped", "delivered", "cancelled"];
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="container max-w-4xl py-5 sm:py-10">
      <div className="mb-6">
        <h1 className="text-display">Order history</h1>
        <p className="mt-1 text-muted-foreground">All your past and current orders</p>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <CatEmpty
          title={filter === "all" ? "No orders yet" : `No ${filter} orders`}
          text="When you place an order it will show up here, with live tracking."
          action={{ href: "/products", label: "Browse products" }}
        />
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => {
            const number = order.order_number || order.id;
            const items = order.items || [];
            const total = order.total_amount ?? order.total ?? 0;
            return (
              <li key={order.id || number}>
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 bg-tint pb-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">#{number}</CardTitle>
                      <p className="text-xs text-muted-foreground">Placed on {formatDate(order.created_at)}</p>
                    </div>
                    <StatusBadge status={order.status} />
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ul className="mb-4 space-y-2">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-foreground">
                            {item.product_name || item.name}
                            <span className="ml-1 text-muted-foreground">×{item.quantity || item.qty}</span>
                          </span>
                          <span className="shrink-0 font-semibold">{formatCurrency((item.unit_price || item.price) * (item.quantity || item.qty))}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-display text-base font-extrabold">{formatCurrency(total)}</span>
                      </div>
                      <Link href={`/orders/${number}`}>
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary" tabIndex={-1}>
                          View details <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
