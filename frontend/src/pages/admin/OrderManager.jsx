import React, { useState } from 'react';
import { Search, Eye, X, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';

const MOCK_ORDERS = [
  { id: 'ORD-9871', customer: 'Rahim Ali', phone: '01700-111222', date: '2026-03-18', status: 'delivered', total: 195100, items: [{ name: 'MacBook Pro M3 14"', qty: 1, price: 195000 }], address: 'House 12, Road 4, Dhanmondi, Dhaka', payment: 'SSLCommerz', shipping: 100 },
  { id: 'ORD-9872', customer: 'Sadia Rahman', phone: '01711-222333', date: '2026-03-19', status: 'processing', total: 45000, items: [{ name: 'Logitech MX Keys S', qty: 2, price: 12500 }, { name: 'Samsung T7 SSD', qty: 2, price: 9800 }], address: 'Flat 3B, Bashundhara R/A, Dhaka', payment: 'SSLCommerz', shipping: 100 },
  { id: 'ORD-9873', customer: 'Karim Hossain', phone: '01811-333444', date: '2026-03-17', status: 'pending', total: 210000, items: [{ name: 'Dell XPS 15 OLED', qty: 1, price: 165000 }, { name: 'HP Envy 15', qty: 1, price: 44900 }], address: '56, Gulshan 2, Dhaka', payment: 'SSLCommerz', shipping: 100 },
  { id: 'ORD-9874', customer: 'Nadia Islam', phone: '01900-444555', date: '2026-03-16', status: 'shipped', total: 140100, items: [{ name: 'Lenovo ThinkPad X1', qty: 1, price: 140000 }], address: 'Road 10, Block D, Mirpur, Dhaka', payment: 'SSLCommerz', shipping: 100 },
  { id: 'ORD-9875', customer: 'Tariq Ahmed', phone: '01612-555666', date: '2026-03-15', status: 'cancelled', total: 9900, items: [{ name: 'Samsung T7 SSD', qty: 1, price: 9800 }], address: 'Agrabad, Chittagong', payment: 'SSLCommerz', shipping: 100 },
];

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-violet-100 text-violet-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(n);

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

const DetailModal = ({ order, onClose, onStatusChange }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-background">
        <h3 className="font-semibold text-lg">Order #{order.id}</h3>
        <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground text-xs mb-0.5">Customer</p><p className="font-medium">{order.customer}</p></div>
          <div><p className="text-muted-foreground text-xs mb-0.5">Phone</p><p className="font-medium">{order.phone}</p></div>
          <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Delivery Address</p><p className="font-medium">{order.address}</p></div>
          <div><p className="text-muted-foreground text-xs mb-0.5">Date</p><p className="font-medium">{order.date}</p></div>
          <div><p className="text-muted-foreground text-xs mb-0.5">Payment</p><p className="font-medium">{order.payment}</p></div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</p>
          <ul className="space-y-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span>{item.name} <span className="text-muted-foreground">×{item.qty}</span></span>
                <span className="font-medium">{formatCurrency(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-sm font-bold border-t mt-3 pt-3">
            <span>Total</span><span>{formatCurrency(order.total)}</span>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Update Status</p>
          <div className="flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(order.id, s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-colors capitalize ${
                  order.status === s ? `${STATUS_STYLES[s]} border-current` : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const OrderManager = () => {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const filtered = orders.filter((o) => {
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = (id, newStatus) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: newStatus } : o));
    if (selectedOrder?.id === id) setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
  };

  return (
    <div className="space-y-6">
      {selectedOrder && (
        <DetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Order Manager</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{orders.length} total orders</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {['all', ...ORDER_STATUSES].map((s) => {
          const count = s === 'all' ? orders.length : orders.filter((o) => o.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border p-3 text-left transition-colors ${statusFilter === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <p className={`text-2xl font-bold ${statusFilter === s ? 'text-primary' : ''}`}>{count}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID or customer..."
              className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['Order ID', 'Customer', 'Date', 'Items', 'Total', 'Status', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No orders found.
                  </td></tr>
                ) : filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4 font-mono font-medium">{order.id}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{order.customer}</div>
                      <div className="text-xs text-muted-foreground">{order.phone}</div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{order.date}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</td>
                    <td className="py-3 pr-4 font-semibold">{formatCurrency(order.total)}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <button onClick={() => setSelectedOrder(order)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderManager;
