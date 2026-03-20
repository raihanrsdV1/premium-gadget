import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2, X, Loader2, Package } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

const MOCK_PRODUCTS = [
  { id: 1, name: 'MacBook Pro M3 14"', brand: 'Apple', sku: 'APL-MBP-M3-14', price: 195000, stock: 5, condition: 'New', status: 'active' },
  { id: 2, name: 'Dell XPS 15 OLED', brand: 'Dell', sku: 'DL-XPS15-OLED', price: 165000, stock: 3, condition: 'Pre-Owned', status: 'active' },
  { id: 3, name: 'Lenovo ThinkPad X1 Carbon', brand: 'Lenovo', sku: 'LN-X1C-G11', price: 140000, stock: 2, condition: 'Pre-Owned', status: 'active' },
  { id: 4, name: 'Logitech MX Keys S', brand: 'Logitech', sku: 'LG-MXKEYS-S', price: 12500, stock: 15, condition: 'New', status: 'active' },
  { id: 5, name: 'Samsung T7 SSD 1TB', brand: 'Samsung', sku: 'SM-T7-1TB', price: 9800, stock: 0, condition: 'New', status: 'inactive' },
  { id: 6, name: 'HP Envy 15 x360', brand: 'HP', sku: 'HP-ENVY15-X360', price: 120000, stock: 4, condition: 'Pre-Owned', status: 'active' },
];

const EMPTY_FORM = { name: '', brand: '', sku: '', price: '', stock: '', condition: 'New', status: 'active' };

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(amount);

const Modal = ({ title, onClose, onSave, form, setForm, isSaving }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-background rounded-xl shadow-xl w-full max-w-lg">
      <div className="flex items-center justify-between p-5 border-b">
        <h3 className="font-semibold text-lg">{title}</h3>
        <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        {[
          { key: 'name', label: 'Product Name', col: 'col-span-2' },
          { key: 'brand', label: 'Brand' },
          { key: 'sku', label: 'SKU' },
          { key: 'price', label: 'Price (৳)', type: 'number' },
          { key: 'stock', label: 'Stock', type: 'number' },
        ].map(({ key, label, col = '', type = 'text' }) => (
          <div key={key} className={col}>
            <label className="text-sm font-medium mb-1 block">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
        <div>
          <label className="text-sm font-medium mb-1 block">Condition</label>
          <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option>New</option>
            <option>Pre-Owned</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 p-5 border-t">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Product
        </Button>
      </div>
    </div>
  </div>
);

const ProductManager = () => {
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.brand.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setForm(EMPTY_FORM); setModal('create'); };
  const openEdit = (p) => { setForm({ ...p, price: String(p.price), stock: String(p.stock) }); setEditId(p.id); setModal('edit'); };
  const closeModal = () => { setModal(null); setEditId(null); };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      if (modal === 'create') {
        setProducts((prev) => [...prev, { ...form, id: Date.now(), price: Number(form.price), stock: Number(form.stock) }]);
      } else {
        setProducts((prev) => prev.map((p) => p.id === editId ? { ...form, id: editId, price: Number(form.price), stock: Number(form.stock) } : p));
      }
      setIsSaving(false);
      closeModal();
    }, 600);
  };

  const handleDelete = (id) => {
    if (confirm('Delete this product?')) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {modal && <Modal title={modal === 'create' ? 'Add Product' : 'Edit Product'} onClose={closeModal} onSave={handleSave} form={form} setForm={setForm} isSaving={isSaving} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Product Manager</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{products.length} products total</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Product</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">SKU</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Price</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Stock</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Condition</th>
                  <th className="pb-3 pr-4 font-medium text-muted-foreground">Status</th>
                  <th className="pb-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No products found.
                  </td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.brand}</div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{p.sku}</td>
                    <td className="py-3 pr-4 font-semibold">{formatCurrency(p.price)}</td>
                    <td className="py-3 pr-4">
                      <span className={`font-semibold ${p.stock === 0 ? 'text-red-500' : p.stock <= 3 ? 'text-amber-500' : 'text-green-600'}`}>
                        {p.stock === 0 ? 'Out of stock' : p.stock}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.condition === 'New' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.condition}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                      </div>
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

export default ProductManager;
