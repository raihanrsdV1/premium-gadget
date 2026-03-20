import React, { useState } from 'react';
import { Plus, Edit, Trash2, X, Loader2, Tag, Copy, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const MOCK_COUPONS = [
  { id: 1, code: 'WELCOME20', type: 'percentage', value: 20, minOrder: 5000, maxDiscount: 2000, uses: 45, maxUses: 100, expiry: '2026-06-30', status: 'active' },
  { id: 2, code: 'FLAT500', type: 'fixed', value: 500, minOrder: 10000, maxDiscount: null, uses: 120, maxUses: 200, expiry: '2026-04-15', status: 'active' },
  { id: 3, code: 'REPAIR10', type: 'percentage', value: 10, minOrder: 2000, maxDiscount: 1000, uses: 30, maxUses: 50, expiry: '2026-03-31', status: 'active' },
  { id: 4, code: 'SUMMER15', type: 'percentage', value: 15, minOrder: 8000, maxDiscount: 3000, uses: 200, maxUses: 200, expiry: '2025-09-30', status: 'expired' },
  { id: 5, code: 'EID2025', type: 'fixed', value: 1000, minOrder: 15000, maxDiscount: null, uses: 0, maxUses: 500, expiry: '2026-05-15', status: 'inactive' },
];

const EMPTY_FORM = { code: '', type: 'percentage', value: '', minOrder: '', maxDiscount: '', maxUses: '', expiry: '', status: 'active' };

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(n);

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-500',
  expired: 'bg-red-100 text-red-600',
};

const Modal = ({ title, form, setForm, onClose, onSave, isSaving }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-background rounded-xl shadow-xl w-full max-w-lg">
      <div className="flex items-center justify-between p-5 border-b">
        <h3 className="font-semibold text-lg">{title}</h3>
        <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Coupon Code</label>
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount (৳)</option>
          </select>
        </div>
        {[
          { key: 'value', label: form.type === 'percentage' ? 'Discount (%)' : 'Discount (৳)', type: 'number' },
          { key: 'minOrder', label: 'Min. Order (৳)', type: 'number' },
          { key: 'maxDiscount', label: 'Max Discount (৳)', type: 'number' },
          { key: 'maxUses', label: 'Max Uses', type: 'number' },
        ].map(({ key, label, type }) => (
          <div key={key}>
            <label className="text-sm font-medium mb-1 block">{label}</label>
            <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        ))}
        <div>
          <label className="text-sm font-medium mb-1 block">Expiry Date</label>
          <input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
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
          Save Coupon
        </Button>
      </div>
    </div>
  </div>
);

const CouponManager = () => {
  const [coupons, setCoupons] = useState(MOCK_COUPONS);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const openCreate = () => { setForm(EMPTY_FORM); setModal('create'); };
  const openEdit = (c) => {
    setForm({ ...c, value: String(c.value), minOrder: String(c.minOrder), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '', maxUses: String(c.maxUses) });
    setEditId(c.id);
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditId(null); };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      const parsed = { ...form, value: Number(form.value), minOrder: Number(form.minOrder), maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null, maxUses: Number(form.maxUses) };
      if (modal === 'create') {
        setCoupons((prev) => [...prev, { ...parsed, id: Date.now(), uses: 0, status: form.status }]);
      } else {
        setCoupons((prev) => prev.map((c) => c.id === editId ? { ...c, ...parsed } : c));
      }
      setIsSaving(false);
      closeModal();
    }, 500);
  };

  const handleDelete = (id) => {
    if (confirm('Delete this coupon?')) setCoupons((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {modal && <Modal title={modal === 'create' ? 'Create Coupon' : 'Edit Coupon'} form={form} setForm={setForm} onClose={closeModal} onSave={handleSave} isSaving={isSaving} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Promotions & Coupons</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{coupons.filter(c=>c.status==='active').length} active coupons</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create Coupon</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {coupons.map((coupon) => {
          const usagePercent = Math.min((coupon.uses / coupon.maxUses) * 100, 100);
          return (
            <Card key={coupon.id} className={coupon.status === 'expired' ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Tag className="h-4 w-4 text-primary" />
                    </div>
                    <button
                      onClick={() => handleCopy(coupon.code, coupon.id)}
                      className="flex items-center gap-1.5 font-mono font-bold text-lg hover:text-primary transition-colors"
                    >
                      {coupon.code}
                      {copiedId === coupon.id ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[coupon.status]}`}>{coupon.status}</span>
                </div>

                <div className="space-y-1.5 text-sm mb-4">
                  <p className="font-semibold text-primary">
                    {coupon.type === 'percentage' ? `${coupon.value}% OFF` : formatCurrency(coupon.value) + ' OFF'}
                    {coupon.maxDiscount && <span className="text-muted-foreground font-normal text-xs ml-1">(max {formatCurrency(coupon.maxDiscount)})</span>}
                  </p>
                  <p className="text-muted-foreground">Min. order: {formatCurrency(coupon.minOrder)}</p>
                  <p className="text-muted-foreground">Expires: {coupon.expiry}</p>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Usage</span>
                    <span>{coupon.uses}/{coupon.maxUses}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${usagePercent}%` }} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(coupon)}><Edit className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                  <Button variant="outline" size="sm" className="text-red-500 hover:text-red-500 hover:bg-red-50" onClick={() => handleDelete(coupon.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default CouponManager;
