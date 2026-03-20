import React, { useState } from 'react';
import { Search, Eye, X, Wrench, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const MOCK_TICKETS = [
  { id: 'RPR-1234', customer: 'Rahim Ali', phone: '01700-111222', device: 'MacBook Pro 2021 (M1)', issue: 'Screen not turning on, liquid damage', status: 'repairing', technician: 'Rahim Al-Mamun', received: '2026-03-18', eta: '2026-03-22', cost: 8500, paid: false },
  { id: 'RPR-1233', customer: 'Sadia Rahman', phone: '01711-222333', device: 'Dell XPS 15 (2022)', issue: 'Battery swelling, keyboard issue', status: 'ready', technician: 'Karim Uddin', received: '2026-03-16', eta: '2026-03-19', cost: 4200, paid: false },
  { id: 'RPR-1232', customer: 'Nadia Islam', phone: '01900-444555', device: 'iPhone 14 Pro Max', issue: 'Screen cracked', status: 'delivered', technician: 'Rahim Al-Mamun', received: '2026-03-14', eta: '2026-03-15', cost: 6000, paid: true },
  { id: 'RPR-1231', customer: 'Tariq Ahmed', phone: '01612-555666', device: 'Lenovo ThinkPad X1', issue: 'SSD upgrade + RAM upgrade', status: 'diagnosing', technician: 'Karim Uddin', received: '2026-03-19', eta: '2026-03-20', cost: 0, paid: false },
  { id: 'RPR-1230', customer: 'Farhan Hossain', phone: '01819-666777', device: 'HP Envy 15', issue: 'Motherboard failure', status: 'received', technician: 'Unassigned', received: '2026-03-19', eta: 'TBD', cost: 0, paid: false },
];

const STATUSES = ['received', 'diagnosing', 'repairing', 'ready', 'delivered'];

const STATUS_STYLES = {
  received: 'bg-slate-100 text-slate-600',
  diagnosing: 'bg-amber-100 text-amber-700',
  repairing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  delivered: 'bg-purple-100 text-purple-700',
};

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(n);

const TicketModal = ({ ticket, onClose, onUpdate }) => {
  const [status, setStatus] = useState(ticket.status);
  const [cost, setCost] = useState(String(ticket.cost));
  const [paid, setPaid] = useState(ticket.paid);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-background">
          <h3 className="font-semibold text-lg">Ticket {ticket.id}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs mb-0.5">Customer</p><p className="font-medium">{ticket.customer}</p></div>
            <div><p className="text-muted-foreground text-xs mb-0.5">Phone</p><p className="font-medium">{ticket.phone}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Device</p><p className="font-medium">{ticket.device}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Issue</p><p className="font-medium">{ticket.issue}</p></div>
            <div><p className="text-muted-foreground text-xs mb-0.5">Received</p><p className="font-medium">{ticket.received}</p></div>
            <div><p className="text-muted-foreground text-xs mb-0.5">Technician</p><p className="font-medium">{ticket.technician}</p></div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-colors capitalize ${
                    status === s ? `${STATUS_STYLES[s]} border-current` : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Repair Cost (৳)</label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-primary w-4 h-4" />
              <label htmlFor="paid" className="text-sm font-medium">Mark as Paid</label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onUpdate(ticket.id, { status, cost: Number(cost), paid }); onClose(); }}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

const RepairDashboard = () => {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = tickets.filter((t) => {
    const matchSearch = !search || t.id.toLowerCase().includes(search.toLowerCase()) || t.customer.toLowerCase().includes(search.toLowerCase()) || t.device.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleUpdate = (id, changes) => {
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, ...changes } : t));
  };

  const active = tickets.filter((t) => !['delivered'].includes(t.status)).length;
  const pendingPayment = tickets.filter((t) => t.cost > 0 && !t.paid).length;
  const readyForPickup = tickets.filter((t) => t.status === 'ready').length;

  return (
    <div className="space-y-6">
      {selected && (
        <TicketModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Repair Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Manage all repair tickets and workflow</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0"><Wrench className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold">{active}</p><p className="text-xs text-muted-foreground">Active Repairs</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold">{readyForPickup}</p><p className="text-xs text-muted-foreground">Ready for Pickup</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold">{tickets.filter(t=>t.status==='diagnosing').length}</p><p className="text-xs text-muted-foreground">Diagnosing</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0"><AlertCircle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-2xl font-bold">{pendingPayment}</p><p className="text-xs text-muted-foreground">Pending Payment</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex gap-1">
              {['all', ...STATUSES].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>{s}</button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {['Ticket', 'Customer', 'Device', 'Technician', 'Status', 'Cost', 'Paid', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4 font-mono font-medium">{t.id}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{t.customer}</div>
                      <div className="text-xs text-muted-foreground">{t.phone}</div>
                    </td>
                    <td className="py-3 pr-4 max-w-[160px]">
                      <div className="font-medium truncate">{t.device}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.issue}</div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{t.technician}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[t.status]}`}>{t.status}</span>
                    </td>
                    <td className="py-3 pr-4 font-medium">{t.cost > 0 ? formatCurrency(t.cost) : '—'}</td>
                    <td className="py-3 pr-4">
                      {t.cost > 0 ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {t.paid ? 'Paid' : 'Unpaid'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3">
                      <button onClick={() => setSelected(t)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
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

export default RepairDashboard;
