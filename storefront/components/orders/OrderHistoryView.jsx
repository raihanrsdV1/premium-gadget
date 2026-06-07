"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, ChevronRight, Package, Clock, CheckCircle, XCircle, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getMyOrders } from "@/lib/api/orders";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", Icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", Icon: Package },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-700", Icon: Package },
  shipped: { label: "Shipped", color: "bg-violet-100 text-violet-700", Icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700", Icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", Icon: XCircle },
  returned: { label: "Returned", color: "bg-red-100 text-red-700", Icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <cfg.Icon className="h-3 w-3" />
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
      <div className="container px-4 py-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const filters = ["all", "processing", "shipped", "delivered", "cancelled"];
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="container py-10 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Order History</h1>
        <p className="text-muted-foreground mt-1">All your past and current orders</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">No orders yet.</p>
          <Link href="/products" className="mt-4 inline-block">
            <Button variant="outline" className="mt-4">Browse Products</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => {
            const number = order.order_number || order.id;
            const items = order.items || [];
            const total = order.total_amount ?? order.total ?? 0;
            return (
              <Card key={order.id || number} className="overflow-hidden">
                <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 bg-slate-50 dark:bg-slate-900/40">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold">#{number}</CardTitle>
                    <p className="text-xs text-muted-foreground">Placed on {formatDate(order.created_at)}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-2 mb-4">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {item.product_name || item.name}
                          <span className="text-muted-foreground ml-1">×{item.quantity || item.qty}</span>
                        </span>
                        <span className="font-medium">{formatCurrency((item.unit_price || item.price) * (item.quantity || item.qty))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-bold text-base">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
