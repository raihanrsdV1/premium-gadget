import React, { useState } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, Printer, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const PRODUCTS = [
  { id: 1, name: 'MacBook Pro M3 14"', brand: 'Apple', sku: 'APL-MBP-M3-14', price: 195000, stock: 5 },
  { id: 2, name: 'Dell XPS 15 OLED', brand: 'Dell', sku: 'DL-XPS15-OLED', price: 165000, stock: 3 },
  { id: 3, name: 'Lenovo ThinkPad X1', brand: 'Lenovo', sku: 'LN-X1C-G11', price: 140000, stock: 2 },
  { id: 4, name: 'Logitech MX Keys S', brand: 'Logitech', sku: 'LG-MXKEYS-S', price: 12500, stock: 15 },
  { id: 5, name: 'Samsung T7 SSD 1TB', brand: 'Samsung', sku: 'SM-T7-1TB', price: 9800, stock: 8 },
  { id: 6, name: 'HP Envy 15 x360', brand: 'HP', sku: 'HP-ENVY15-X360', price: 120000, stock: 4 },
  { id: 7, name: 'Anker 7-in-1 USB-C Hub', brand: 'Anker', sku: 'ANK-HUB-7IN1', price: 3200, stock: 12 },
  { id: 8, name: 'Sony WH-1000XM5', brand: 'Sony', sku: 'SNY-WH1000XM5', price: 38000, stock: 6 },
];

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(n);

const POSTerminal = () => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [saleComplete, setSaleComplete] = useState(false);

  const filtered = PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.brand.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((i) => i.id === id ? { ...i, qty: i.qty + delta } : i)
        .filter((i) => i.qty > 0)
    );
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountAmount = discount ? Math.min(Number(discount), subtotal) : 0;
  const total = subtotal - discountAmount;

  const handleCompleteSale = () => {
    if (cart.length === 0) return;
    setSaleComplete(true);
  };

  const handleNewSale = () => {
    setCart([]);
    setDiscount('');
    setCustomerName('');
    setPaymentMethod('cash');
    setSaleComplete(false);
    setSearch('');
  };

  if (saleComplete) {
    const orderId = `POS-${Date.now().toString().slice(-6)}`;
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Sale Completed!</h2>
          <p className="text-muted-foreground mb-1">Order <strong>{orderId}</strong></p>
          <p className="text-3xl font-bold text-primary mb-6">{formatCurrency(total)}</p>
          <p className="text-sm text-muted-foreground mb-6">Payment via <strong className="capitalize">{paymentMethod}</strong></p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => alert('Printing receipt...')}>
              <Printer className="mr-2 h-4 w-4" />Print Receipt
            </Button>
            <Button className="flex-1" onClick={handleNewSale}>
              <RotateCcw className="mr-2 h-4 w-4" />New Sale
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Product search panel */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">POS Terminal</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Walk-in sales & cash transactions</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, brand, or SKU..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto flex-1">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={product.stock === 0}
              className="text-left p-3 rounded-lg border bg-card hover:bg-accent hover:border-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="font-medium text-sm leading-tight mb-1 line-clamp-2">{product.name}</p>
              <p className="text-xs text-muted-foreground mb-2">{product.brand} · {product.sku}</p>
              <p className="font-bold text-primary">{formatCurrency(product.price)}</p>
              <p className="text-xs text-muted-foreground mt-1">Stock: {product.stock}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart panel */}
      <div className="w-80 shrink-0 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5" />
              Cart
              {cart.length > 0 && <span className="ml-auto text-sm font-normal text-muted-foreground">{cart.reduce((s,i)=>s+i.qty,0)} item{cart.length>1?'s':''}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                <p>No items added</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {cart.map((item) => (
                  <li key={item.id} className="bg-muted/40 rounded-lg p-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-medium leading-tight flex-1">{item.name}</p>
                      <button onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-background transition-colors"><Minus className="h-3 w-3" /></button>
                        <span className="text-sm font-medium w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)} disabled={item.qty >= item.stock} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-background transition-colors disabled:opacity-40"><Plus className="h-3 w-3" /></button>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(item.price * item.qty)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Checkout panel */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer Name (optional)</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" className="w-full h-8 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Discount (৳)</label>
              <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" min="0" className="w-full h-8 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Method</label>
              <div className="flex gap-2">
                {['cash', 'card', 'bkash', 'nagad'].map((m) => (
                  <button key={m} onClick={() => setPaymentMethod(m)} className={`flex-1 py-1.5 rounded-md text-xs font-medium border-2 capitalize transition-colors ${paymentMethod === m ? 'border-primary bg-primary/5 text-primary' : 'border-muted-foreground/30 text-muted-foreground'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(discountAmount)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1 border-t mt-1"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
            </div>
            <Button className="w-full" size="lg" disabled={cart.length === 0} onClick={handleCompleteSale}>
              Complete Sale
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default POSTerminal;
