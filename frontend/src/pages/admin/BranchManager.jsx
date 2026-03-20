import React, { useState } from 'react';
import { MapPin, Phone, Plus, Edit, Trash2, X, Loader2, Users } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const MOCK_BRANCHES = [
  { id: 1, name: 'Dhaka Main Branch', address: 'Level 4, Multiplan Center, New Elephant Road, Dhaka-1205', phone: '01700-000001', manager: 'Rafiqul Islam', staff: 8, status: 'active', hours: 'Sat–Thu 10am–8pm' },
  { id: 2, name: 'Chittagong Branch', address: '3rd Floor, Deen Plaza, Agrabad, Chittagong-4100', phone: '01700-000002', manager: 'Nasim Ahmed', staff: 5, status: 'active', hours: 'Sat–Thu 10am–8pm' },
  { id: 3, name: 'Sylhet Branch', address: 'Zindabazar Road, Sylhet-3100', phone: '01700-000003', manager: 'Karim Uddin', staff: 3, status: 'inactive', hours: 'Sat–Thu 10am–7pm' },
];

const EMPTY_FORM = { name: '', address: '', phone: '', manager: '', staff: '', status: 'active', hours: 'Sat–Thu 10am–8pm' };

const Modal = ({ title, form, setForm, onClose, onSave, isSaving }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-background rounded-xl shadow-xl w-full max-w-lg">
      <div className="flex items-center justify-between p-5 border-b">
        <h3 className="font-semibold text-lg">{title}</h3>
        <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        {[
          { key: 'name', label: 'Branch Name', col: 'col-span-2' },
          { key: 'address', label: 'Address', col: 'col-span-2' },
          { key: 'phone', label: 'Phone' },
          { key: 'manager', label: 'Manager Name' },
          { key: 'staff', label: 'Staff Count', type: 'number' },
          { key: 'hours', label: 'Operating Hours' },
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
          Save Branch
        </Button>
      </div>
    </div>
  </div>
);

const BranchManager = () => {
  const [branches, setBranches] = useState(MOCK_BRANCHES);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => { setForm(EMPTY_FORM); setModal('create'); };
  const openEdit = (b) => { setForm({ ...b, staff: String(b.staff) }); setEditId(b.id); setModal('edit'); };
  const closeModal = () => { setModal(null); setEditId(null); };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      if (modal === 'create') {
        setBranches((prev) => [...prev, { ...form, id: Date.now(), staff: Number(form.staff) }]);
      } else {
        setBranches((prev) => prev.map((b) => b.id === editId ? { ...form, id: editId, staff: Number(form.staff) } : b));
      }
      setIsSaving(false);
      closeModal();
    }, 500);
  };

  const handleDelete = (id) => {
    if (confirm('Delete this branch?')) setBranches((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-6">
      {modal && <Modal title={modal === 'create' ? 'Add Branch' : 'Edit Branch'} form={form} setForm={setForm} onClose={closeModal} onSave={handleSave} isSaving={isSaving} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Branch Manager</h2>
          <p className="text-muted-foreground text-sm mt-0.5">{branches.length} store locations</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Branch</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((branch) => (
          <Card key={branch.id} className={branch.status === 'inactive' ? 'opacity-60' : ''}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${branch.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {branch.status}
                </span>
              </div>
              <h3 className="font-bold text-base mb-1">{branch.name}</h3>
              <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{branch.address}</p>
              <div className="space-y-1.5 text-sm mb-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {branch.phone}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {branch.staff} staff · Manager: {branch.manager}
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">{branch.hours}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(branch)}>
                  <Edit className="mr-1.5 h-3.5 w-3.5" />Edit
                </Button>
                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-500 hover:bg-red-50" onClick={() => handleDelete(branch.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default BranchManager;
