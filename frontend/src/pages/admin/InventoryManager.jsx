import React, { useState } from 'react';
import { Search, AlertTriangle, TrendingUp, Package, Edit, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const MOCK_INVENTORY = [
  { id: 1, sku: 'APL-MBP-M3-14', name: 'MacBook Pro M3 14"', brand: 'Apple', stock: 5, minStock: 3, location: 'Dhaka Main', lastRestocked: '2026-03-10', unitCost: 160000 },
  { id: 2, sku: 'DL-XPS15-OLED', name: 'Dell XPS 15 OLED', brand: 'Dell', stock: 3, minStock: 2, location: 'Dhaka Main', lastRestocked: '2026-03-05', unitCost: 130000 },
  { id: 3, sku: 'LN-X1C-G11', name: 'Lenovo ThinkPad X1', brand: 'Lenovo', stock: 2, minStock: 3, location: 'Chittagong', lastRestocked: '2026-02-20', unitCost: 110000 },
  { id: 4, sku: 'LG-MXKEYS-S', name: 'Logitech MX Keys S', brand: 'Logitech', stock: 15, minStock: 5, location: 'Dhaka Main', lastRestocked: '2026-03-15', unitCost: 9000 },
  { id: 5, sku: 'SM-T7-1TB', name: 'Samsung T7 SSD 1TB', brand: 'Samsung', stock: 0, minStock: 5, location: 'Dhaka Main', lastRestocked: '2026-01-10', unitCost: 7500 },
  { id: 6, sku: 'HP-ENVY15-X360', name: 'HP Envy 15 x360', brand: 'HP', stock: 4, minStock: 2, location: 'Sylhet', lastRestocked: '2026-03-01', unitCost: 95000 },
  { id: 7, sku: 'ANK-HUB-7IN1', name: 'Anker 7-in-1 USB-C Hub', brand: 'Anker', stock: 1, minStock: 4, location: 'Dhaka Main', lastRestocked: '2026-02-01', unitCost: 2800 },
];

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(n);

const StockModal = ({ item, onClose, onSave }) => {
  const [qty, setQty] = useState('');
  const [action, setAction] = useState('add');

  const handleSave = () => {
    const amount = Number(qty);
    if (!amount || amount < 0) return;
    const newStock = action === 'add' ? item.stock + amount : Math.max(0, item.stock - amount);
    onSave(item.id, newStock);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold">Adjust Stock</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">Current stock: <strong>{item.stock}</strong></p>
          </div>
          <div className="flex gap-3">
            {['add', 'remove'].map((a) => (
              <button key={a} onClick={() => setAction(a)} className={`flex-1 py-2 rounded-md text-sm font-medium border-2 capitalize transition-colors ${action === a ? 'border-primary bg-primary/5 text-primary' : 'border-muted-foreground/30 text-muted-foreground'}`}>{a}</button>
            ))}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Quantity</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Enter quantity"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!qty}>Save</Button>
        </div>
      </div>
    </div>
  );
};

const InventoryManager = () => {
  const [inventory, setInventory] = useState(MOCK_INVENTORY);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editItem, setEditItem] = useState(null);

  const filtered = inventory.filter((i) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()) || i.brand.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      (filter === 'low' && i.stock > 0 && i.stock <= i.minStock) ||
      (filter === 'out' && i.stock === 0) ||
      (filter === 'ok' && i.stock > i.minStock);
    return matchSearch && matchFilter;
  });

  const handleSaveStock = (id, newStock) => {
    setInventory((prev) => prev.map((i) => i.id === id ? { ...i, stock: newStock, lastRestocked: new Date().toISOString().split('T')[0] } : i));
  };

  const lowStockCount = inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock).length;
  const outOfStockCount = inventory.filter((i) => i.stock === 0).length;

  return (
    <div className="space-y-6">
      {editItem && <StockModal item={editItem} onClose={() => setEditItem(null)} onSave={handleSaveStock} />}

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Inventory Manager</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Track stock levels across all locations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total SKUs', value: inventory.length, color: 'bg-blue-100 text-blue-600', Icon: Package },
          { label: 'In Stock', value: inventory.filter(i=>i.stock>i.minStock).length, color: 'bg-green-100 text-green-600', Icon: TrendingUp },
          { label: 'Low Stock', value: lowStockCount, color: 'bg-amber-100 text-amber-600', Icon: AlertTriangle },
          { label: 'Out of Stock', value: outOfStockCount, color: 'bg-red-100 text-red-600', Icon: AlertTriangle },
        ].map(({ label, value, color, Icon }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className="h-5 w-5" />
              </div>
              <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU, brand..." className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-1">
              {[['all','All'], ['ok','In Stock'], ['low','Low Stock'], ['out','Out of Stock']].map(([v, l]) => (
                <button key={v} onClick={() => setFilter(v)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>{l}</button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['Product', 'SKU', 'Location', 'Stock', 'Min. Stock', 'Unit Cost', 'Last Restocked', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => {
                  const isLow = item.stock > 0 && item.stock <= item.minStock;
                  const isOut = item.stock === 0;
                  return (
                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.brand}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{item.sku}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.location}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-600'}`}>
                            {item.stock}
                          </span>
                          {(isOut || isLow) && <AlertTriangle className={`h-3.5 w-3.5 ${isOut ? 'text-red-500' : 'text-amber-500'}`} />}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.minStock}</td>
                      <td className="py-3 pr-4 font-medium">{formatCurrency(item.unitCost)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.lastRestocked}</td>
                      <td className="py-3">
                        <button onClick={() => setEditItem(item)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                          <Edit className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryManager;
