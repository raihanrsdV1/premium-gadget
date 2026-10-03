import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { MonitorPlay, RotateCcw } from 'lucide-react';
import {
  Badge, DataTable, Pagination, PageHeader,
} from '@/components/admin/DataTable';
import { Select } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import {
  BranchFilter, DateRange, FilterField, SearchBox,
} from '@/components/admin/ops/OpsUi';
import { useUrlFilters } from '@/components/admin/ops/useUrlFilters';
import { PAYMENT_METHOD, POS_PAYMENT_METHODS, dhakaDate, formatPhone } from '@/components/admin/ops/labels';
import { useGetSalesQuery } from '@/store/api/opsApi';
import { formatBDT, formatDateTime } from '@/lib/format';
import { errorText } from '@/lib/apiError';

const monthStart = () => `${dhakaDate().slice(0, 8)}01`;

const PRESETS = [
  { label: 'Today', range: () => [dhakaDate(), dhakaDate()] },
  { label: 'Yesterday', range: () => [dhakaDate(-1), dhakaDate(-1)] },
  { label: 'Last 7 days', range: () => [dhakaDate(-6), dhakaDate()] },
  { label: 'This month', range: () => [monthStart(), dhakaDate()] },
];

const SummaryCard = ({ label, value, sub, strong }) => (
  <div className={`rounded-lg border bg-white px-4 py-3 ${strong ? 'border-primary/40 bg-primary/5' : ''}`}>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 font-bold tabular-nums text-slate-900 ${strong ? 'text-2xl' : 'text-xl'}`}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
  </div>
);

/** /admin/pos/sales — counter sales with the day-close summary. */
const SalesHistoryPage = () => {
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const today = dhakaDate();
  const [f, setF] = useUrlFilters({ from: today, to: today, page: '1' });
  const [searchKey, setSearchKey] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useGetSalesQuery({
    from: f.from,
    to: f.to,
    payment_method: f.payment_method,
    branch_id: isSuper ? f.branch_id : undefined,
    q: f.q,
    voided: f.voided,
    page: f.page,
    limit: 25,
  });
  const s = data?.summary;
  const byMethod = s?.by_payment_method || {};
  const rangeLabel = f.from === f.to ? (f.from === today ? 'today' : f.from) : `${f.from} to ${f.to}`;

  const columns = [
    {
      key: 'no', header: 'Sale',
      render: (r) => (
        <div>
          <Link to={`/admin/pos/sales/${r.id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-[13px] font-semibold text-primary hover:underline">{r.order_number}</Link>
          {r.voided_at && <div className="mt-0.5"><Badge tone="red">Voided</Badge></div>}
        </div>
      ),
    },
    { key: 'time', header: 'Time', className: 'whitespace-nowrap text-slate-600', render: (r) => formatDateTime(r.created_at) },
    {
      key: 'customer', header: 'Customer',
      render: (r) => (r.customer_name || r.customer_phone
        ? <div><p className="text-slate-900">{r.customer_name || '—'}</p>{r.customer_phone && <p className="text-xs text-slate-500">{formatPhone(r.customer_phone)}</p>}</div>
        : <span className="text-slate-400">Walk-in</span>),
    },
    { key: 'items', header: 'Items', className: 'text-center', headerClassName: 'text-center', render: (r) => r.item_count },
    { key: 'pay', header: 'Payment', className: 'whitespace-nowrap', render: (r) => PAYMENT_METHOD[r.payment_method] || r.payment_method },
    {
      key: 'total', header: 'Total', className: 'whitespace-nowrap text-right', headerClassName: 'text-right',
      render: (r) => (
        <span className={`font-semibold ${r.voided_at ? 'text-slate-400 line-through' : ''}`}>{formatBDT(r.total_amount)}</span>
      ),
    },
    {
      key: 'disc', header: 'Discount', className: 'whitespace-nowrap text-right text-slate-600', headerClassName: 'text-right',
      render: (r) => (Number(r.discount) > 0 ? `${formatBDT(r.discount)}${r.coupon_code ? ` (${r.coupon_code})` : ''}` : '—'),
    },
    { key: 'op', header: 'Sold by', className: 'whitespace-nowrap text-slate-600', render: (r) => r.operator_name || '—' },
    { key: 'branch', header: 'Branch', className: 'whitespace-nowrap text-slate-600', render: (r) => r.branch_name },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Sales history" description="In-store sales and the day-close totals. Open a sale to reprint its receipt."
        actions={<Link to="/admin/pos"><Button><MonitorPlay className="mr-2 h-4 w-4" />New sale</Button></Link>} />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <DateRange idPrefix="sales" from={f.from} to={f.to} onChange={({ from, to }) => setF({ from, to })} />
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {PRESETS.map((p) => {
            const [from, to] = p.range();
            const on = f.from === from && f.to === to;
            return (
              <Button key={p.label} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => setF({ from, to })}>{p.label}</Button>
            );
          })}
        </div>
        <FilterField label="Payment" htmlFor="sales-pm">
          <Select id="sales-pm" value={f.payment_method || ''} onChange={(e) => setF({ payment_method: e.target.value })} className="w-36">
            <option value="">All methods</option>
            {POS_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}
          </Select>
        </FilterField>
        {isSuper && <BranchFilter id="sales-branch" value={f.branch_id} onChange={(branch_id) => setF({ branch_id })} className="w-44" />}
        <FilterField label="Show" htmlFor="sales-voided">
          <Select id="sales-voided" value={f.voided || ''} onChange={(e) => setF({ voided: e.target.value })} className="w-36">
            <option value="">All sales</option>
            <option value="false">Not voided</option>
            <option value="true">Voided only</option>
          </Select>
        </FilterField>
        <SearchBox key={searchKey} id="sales-q" label="Search" value={f.q} onSearch={(q) => setF({ q })} placeholder="Sale no., phone or name" className="w-full sm:w-56" />
        {(f.payment_method || f.branch_id || f.q || f.voided) && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setF({ payment_method: '', branch_id: '', q: '', voided: '' }); setSearchKey((k) => k + 1); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" />Clear filters
          </Button>
        )}
      </div>

      <section aria-label="Day-close summary" className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Summary for {rangeLabel}{f.payment_method ? ` · ${PAYMENT_METHOD[f.payment_method]} only` : ''}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Sales" value={s ? s.count : '—'} sub={s?.voided_count ? `${s.voided_count} voided (${formatBDT(s.voided_net)}) not counted` : 'Voided sales are not counted'} />
          <SummaryCard label="Gross" value={s ? formatBDT(s.gross) : '—'} sub="Before discounts" />
          <SummaryCard label="Discounts" value={s ? formatBDT(s.discount) : '—'} sub="Manual + coupons" />
          <SummaryCard label="Net taken" value={s ? formatBDT(s.net) : '—'} sub="What should be in hand" strong />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {POS_PAYMENT_METHODS.map((m) => (
            <div key={m} className="flex items-center justify-between rounded-lg border bg-white px-4 py-2.5 text-sm">
              <span className="font-medium text-slate-700">{PAYMENT_METHOD[m]}</span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums text-slate-900">{formatBDT(byMethod[m]?.net || 0)}</span>
                <span className="block text-xs text-slate-500">{byMethod[m]?.count || 0} sale{(byMethod[m]?.count || 0) === 1 ? '' : 's'}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
        <DataTable dense columns={columns} rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch}
          onRowClick={(r) => navigate(`/admin/pos/sales/${r.id}`)} empty={`No in-store sales for ${rangeLabel}.`} />
      </div>
      <Pagination pagination={data?.pagination} onPage={(page) => setF({ page }, { keepPage: true })} />
    </div>
  );
};

export default SalesHistoryPage;
