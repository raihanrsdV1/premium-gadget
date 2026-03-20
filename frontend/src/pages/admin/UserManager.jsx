import React, { useState } from 'react';
import { Search, UserCircle, Shield, Ban, CheckCircle, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const MOCK_USERS = [
  { id: 1, name: 'Rahim Ali', phone: '01700-111222', email: 'rahim@example.com', role: 'customer', status: 'active', joined: '2025-01-15', orders: 5 },
  { id: 2, name: 'Sadia Rahman', phone: '01711-222333', email: 'sadia@example.com', role: 'customer', status: 'active', joined: '2025-02-20', orders: 2 },
  { id: 3, name: 'Karim Hossain', phone: '01811-333444', email: '', role: 'customer', status: 'suspended', joined: '2024-11-10', orders: 1 },
  { id: 4, name: 'Admin User', phone: '01900-000001', email: 'admin@premiumgadget.com', role: 'super_admin', status: 'active', joined: '2024-01-01', orders: 0 },
  { id: 5, name: 'Branch Staff', phone: '01900-000002', email: 'staff@premiumgadget.com', role: 'branch_admin', status: 'active', joined: '2024-06-01', orders: 0 },
  { id: 6, name: 'Nadia Islam', phone: '01900-444555', email: 'nadia@example.com', role: 'customer', status: 'active', joined: '2025-03-01', orders: 3 },
];

const ROLE_STYLES = {
  customer: 'bg-slate-100 text-slate-600',
  branch_admin: 'bg-blue-100 text-blue-700',
  super_admin: 'bg-violet-100 text-violet-700',
};

const DetailModal = ({ user, onClose, onUpdate }) => {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-lg">User Details</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xl font-bold shrink-0">
              {user.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-lg">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.phone}</p>
              {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs mb-0.5">Joined</p><p className="font-medium">{user.joined}</p></div>
            <div><p className="text-muted-foreground text-xs mb-0.5">Orders</p><p className="font-medium">{user.orders}</p></div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="customer">Customer</option>
              <option value="branch_admin">Branch Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Status</label>
            <div className="flex gap-3">
              {['active', 'suspended'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border-2 transition-colors capitalize ${
                    status === s
                      ? s === 'active' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onUpdate(user.id, { role, status }); onClose(); }}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};

const UserManager = () => {
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleUpdate = (id, changes) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...changes } : u));
  };

  return (
    <div className="space-y-6">
      {selected && <DetailModal user={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />}

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Customers & Roles</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{users.length} registered users</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Customers', count: users.filter(u=>u.role==='customer').length, icon: UserCircle, color: 'blue' },
          { label: 'Staff', count: users.filter(u=>['branch_admin','super_admin'].includes(u.role)).length, icon: Shield, color: 'violet' },
          { label: 'Suspended', count: users.filter(u=>u.status==='suspended').length, icon: Ban, color: 'red' },
        ].map(({ label, count, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 bg-${color}-100 rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 text-${color}-600`} />
              </div>
              <div><p className="text-2xl font-bold">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-1">
              {['all', 'customer', 'branch_admin', 'super_admin'].map((r) => (
                <button key={r} onClick={() => setRoleFilter(r)} className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors ${roleFilter === r ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>{r.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['User', 'Contact', 'Role', 'Orders', 'Joined', 'Status', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold shrink-0">{u.name.charAt(0)}</div>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div>{u.phone}</div>
                      {u.email && <div className="text-xs text-muted-foreground">{u.email}</div>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${ROLE_STYLES[u.role]}`}>{u.role.replace('_', ' ')}</span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.orders}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.joined}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <button onClick={() => setSelected(u)} className="text-xs font-medium text-primary hover:underline">Manage</button>
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

export default UserManager;
