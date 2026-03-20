import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight, Package, Clock, CheckCircle, XCircle, Truck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { useSelector } from 'react-redux';

const MOCK_ORDERS = [
  {
    id: 'ORD-9871',
    date: '2025-03-15',
    status: 'delivered',
    items: [{ name: 'MacBook Pro M3 14"', qty: 1, price: 195000 }],
    total: 195100,
    shipping: 100,
  },
  {
    id: 'ORD-9745',
    date: '2025-02-28',
    status: 'processing',
    items: [
      { name: 'Logitech MX Keys S', qty: 1, price: 12500 },
      { name: 'Anker USB-C Hub', qty: 2, price: 3200 },
    ],
    total: 18900,
    shipping: 0,
  },
  {
    id: 'ORD-9612',
    date: '2025-01-10',
    status: 'cancelled',
    items: [{ name: 'Dell XPS 15 OLED', qty: 1, price: 165000 }],
    total: 165100,
    shipping: 100,
  },
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', Icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700', Icon: Package },
  shipped: { label: 'Shipped', color: 'bg-violet-100 text-violet-700', Icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', Icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', Icon: XCircle },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

const OrderHistory = () => {
  const [filter, setFilter] = useState('all');
  const { isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return (
      <div className="container py-24 text-center max-w-md mx-auto">
        <ShoppingBag className="h-16 w-16 text-muted-foreground/40 mx-auto mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Sign in to view your orders</h2>
        <p className="text-muted-foreground mb-8">Track and manage all your purchases in one place.</p>
        <Link to="/login"><Button size="lg">Sign In</Button></Link>
      </div>
    );
  }

  const filters = ['all', 'processing', 'shipped', 'delivered', 'cancelled'];
  const filtered = filter === 'all' ? MOCK_ORDERS : MOCK_ORDERS.filter((o) => o.status === filter);

  return (
    <div className="container py-10 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Order History</h1>
        <p className="text-muted-foreground mt-1">All your past and current orders</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">No orders found.</p>
          <Link to="/products" className="mt-4 inline-block">
            <Button variant="outline" className="mt-4">Browse Products</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <Card key={order.id} className="overflow-hidden">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 bg-slate-50 dark:bg-slate-900/40">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">#{order.id}</CardTitle>
                  <p className="text-xs text-muted-foreground">Placed on {formatDate(order.date)}</p>
                </div>
                <StatusBadge status={order.status} />
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2 mb-4">
                  {order.items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {item.name}
                        <span className="text-muted-foreground ml-1">×{item.qty}</span>
                      </span>
                      <span className="font-medium">{formatCurrency(item.price * item.qty)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-bold text-base">{formatCurrency(order.total)}</span>
                    {order.shipping > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">(incl. ৳{order.shipping} shipping)</span>
                    )}
                  </div>
                  <Link to={`/orders/${order.id}`}>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                      View Details <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderHistory;
