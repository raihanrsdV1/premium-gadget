import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { DataTable, Pagination, Badge, PageHeader } from '../../components/admin/DataTable';
import { Field, TextInput, Select } from '../../components/admin/Field';
import { Button } from '../../components/ui/Button';
import { useGetAuditActionsQuery, useGetAuditLogQuery, useGetStaffListQuery } from '../../store/api/opsApi';
import { errorText } from '../../lib/apiError';
import { formatBDT, formatDateTime } from '../../lib/format';

const ROLE = { super_admin: 'Super admin', branch_admin: 'Branch staff' };
const FIELD_LABEL = {
  price: 'price', compare_at_price: '"was" price', cost_price: 'cost', sale_price: 'sale price',
  sale_starts_at: 'sale start', sale_ends_at: 'sale end',
};
const MONEY = new Set(['price', 'compare_at_price', 'cost_price', 'sale_price']);
const ENTITIES = [
  ['variant', 'Variants & prices'], ['product', 'Products'], ['order', 'Orders'], ['inventory', 'Inventory / stock'],
  ['collection', 'Collections'], ['site_setting', 'Settings'], ['banner', 'Banners'], ['category', 'Categories'],
  ['brand', 'Brands'], ['user', 'Users'], ['coupon', 'Coupons'], ['branch', 'Branches'],
];

const val = (field, v) => {
  if (v === null || v === undefined || v === '') return 'none';
  if (MONEY.has(field)) return formatBDT(v);
  if (field.endsWith('_at')) return formatDateTime(v);
  return String(v);
};

/** Plain-English one-liner for common actions; falls back to the action name. */
const summarize = (row) => {
  const d = row.data || {};
  const a = row.action || '';
  const name = d.name || d.sku || d.order_number || d.title || '';
  try {
    if (a === 'variant.update' && d.before && d.after) {
      const changes = Object.keys(d.after).filter((k) => FIELD_LABEL[k] && (MONEY.has(k) ? Number(d.after[k]) !== Number(d.before[k]) : JSON.stringify(d.after[k]) !== JSON.stringify(d.before[k])));
      if (changes.length) {
        const txt = changes.map((k) => `${FIELD_LABEL[k]} ${val(k, d.before[k])} → ${val(k, d.after[k])}`).join(', ');
        return `Price changed${d.sku ? ` (${d.sku})` : ''}: ${txt}`;
      }
      return `Variant edited${d.sku ? ` (${d.sku})` : ''}`;
    }
    if (a === 'variant.create') return `Variant added${d.sku ? ` (${d.sku})` : ''}`;
    if (a === 'order.status') return `Order status changed${d.from && d.to ? `: ${d.from} → ${d.to}` : ''}`;
    if (a === 'order.payment') return `Order payment changed${d.from && d.to ? `: ${d.from} → ${d.to}` : ''}`;
    if (a.startsWith('inventory.') || a.startsWith('stock.')) {
      if (a.includes('transfer')) return `Stock transferred${d.quantity ? ` (${d.quantity} units)` : ''}`;
      if (a.includes('adjust')) return `Stock adjusted${d.delta ? ` by ${d.delta > 0 ? '+' : ''}${d.delta}` : ''}`;
    }
    if (a === 'product.collections') return 'Product collections changed';
    if (a === 'product.create') return `Product created${name ? `: ${name}` : ''}`;
    if (a.startsWith('product.')) return `Product edited${name ? `: ${name}` : ''}`;
    if (a.startsWith('collection.')) {
      const verb = { create: 'created', update: 'changed', delete: 'deleted', reorder: 'reordered', products: 'products changed' }[a.split('.')[1]] || 'changed';
      return `Collection ${verb}${name ? `: ${name}` : ''}`;
    }
    if (a === 'settings.update') return `Settings changed${d.key ? `: ${d.key}` : ''}`;
  } catch { /* fall through */ }
  return a;
};

const ActivityLogView = () => {
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(() => new Set());
  const page = Number(sp.get('page')) || 1;
  const filters = { action: sp.get('action') || '', actor_id: sp.get('actor_id') || '', entity: sp.get('entity') || '', from: sp.get('from') || '', to: sp.get('to') || '' };
  const setFilter = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    next.delete('page');
    setSp(next, { replace: true });
  };
  const setPage = (p) => { const next = new URLSearchParams(sp); next.set('page', String(p)); setSp(next, { replace: true }); };

  const { data, isFetching, isLoading, error, refetch } = useGetAuditLogQuery({ ...filters, page, limit: 25 });
  const { data: actions = [] } = useGetAuditActionsQuery();
  const { data: supers = [] } = useGetStaffListQuery('super_admin');
  const { data: branchStaff = [] } = useGetStaffListQuery('branch_admin');
  const people = useMemo(() => [...supers, ...branchStaff], [supers, branchStaff]);

  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hasFilters = Object.values(filters).some(Boolean);

  const columns = [
    { key: 'at', header: 'When', className: 'whitespace-nowrap', render: (r) => formatDateTime(r.at) },
    { key: 'actor', header: 'Who', render: (r) => (r.actor ? (
      <div><p className="font-medium text-slate-900">{r.actor.full_name}</p><p className="text-xs text-slate-500">{ROLE[r.actor.role] || r.actor.role}</p></div>
    ) : <span className="text-slate-400">System</span>) },
    { key: 'what', header: 'What happened', render: (r) => (
      <div>
        <p className="text-slate-900">{summarize(r)}</p>
        <p className="font-mono text-xs text-slate-500">{r.action}</p>
        {open.has(r.id) && (
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify({ entity: r.entity, entity_id: r.entity_id, ip: r.ip, data: r.data }, null, 2)}</pre>
        )}
      </div>
    ) },
    { key: 'details', header: '', className: 'text-right align-top', render: (r) => (
      <button type="button" onClick={() => toggle(r.id)} aria-expanded={open.has(r.id)} aria-label={`Details for ${r.action}`}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-slate-100">
        {open.has(r.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Details
      </button>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Activity log" description="Who changed what, newest first. Only the owner can see this." />
      <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Action">
          {(id) => <Select id={id} value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>}
        </Field>
        <Field label="Who">
          {(id) => <Select id={id} value={filters.actor_id} onChange={(e) => setFilter({ actor_id: e.target.value })}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>}
        </Field>
        <Field label="About">
          {(id) => <Select id={id} value={filters.entity} onChange={(e) => setFilter({ entity: e.target.value })}>
            <option value="">Everything</option>
            {ENTITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>}
        </Field>
        <Field label="From">{(id) => <TextInput id={id} type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />}</Field>
        <Field label="To">{(id) => <TextInput id={id} type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />}</Field>
        {hasFilters && <div className="sm:col-span-2 lg:col-span-5"><Button variant="ghost" size="sm" onClick={() => setSp({}, { replace: true })}>Clear filters</Button></div>}
      </div>
      <DataTable columns={columns} rows={data?.data || []} loading={isLoading || (isFetching && !data)} error={error ? errorText(error) : null} onRetry={refetch}
        empty={hasFilters ? 'Nothing matches these filters.' : 'No activity yet.'} />
      <Pagination pagination={data?.pagination} onPage={setPage} />
      {isFetching && data && <Badge tone="slate">Updating…</Badge>}
    </div>
  );
};

const ActivityLog = () => {
  const isSuper = useSelector((st) => st.auth.user?.role) === 'super_admin';
  if (!isSuper) {
    return (
      <div>
        <PageHeader title="Activity log" />
        <p className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600"><Lock className="h-4 w-4" />Only a super admin can see the activity log.</p>
      </div>
    );
  }
  return <ActivityLogView />;
};

export default ActivityLog;
