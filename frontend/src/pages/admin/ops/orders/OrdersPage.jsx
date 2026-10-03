import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Phone, RotateCcw } from 'lucide-react';
import { DataTable, Pagination, PageHeader } from '@/components/admin/DataTable';
import { Select } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import {
  BranchFilter, DateRange, FilterField, OrderStatusBadge, PaymentCell, SearchBox, Tabs,
} from '@/components/admin/ops/OpsUi';
import { useUrlFilters } from '@/components/admin/ops/useUrlFilters';
import { CHANNEL, PAYMENT_METHOD, formatPhone } from '@/components/admin/ops/labels';
import { useGetOrdersQuery } from '@/store/api/opsApi';
import { formatBDT, formatDateTime } from '@/lib/format';
import { errorText } from '@/lib/apiError';

const TABS = [
  { value: 'pending', label: 'Needs action' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Cancelled / Returned' },
  { value: 'all', label: 'All' },
];

const EMPTY = {
  pending: 'No orders need action right now.',
  confirmed: 'No confirmed orders waiting to be packed.',
  processing: 'Nothing is being packed right now.',
  shipped: 'No orders are out for delivery.',
  delivered: 'No delivered orders match these filters.',
  closed: 'No cancelled or returned orders match these filters.',
  all: 'No orders match these filters.',
};

/** Where a row opens: in-store sales live on the POS screens. */
const orderHref = (o) => (o.channel === 'pos' ? `/admin/pos/sales/${o.id}` : `/admin/orders/${o.id}`);

const OrdersPage = () => {
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const [f, setF] = useUrlFilters({ tab: 'pending', closed: 'cancelled', page: '1' });
  const [searchKey, setSearchKey] = useState(0); // remounts the search box on "Clear filters"

  const status = f.tab === 'all' ? undefined : f.tab === 'closed' ? f.closed : f.tab;
  const { data, isFetching, isLoading, error, refetch } = useGetOrdersQuery({
    status,
    payment_method: f.payment_method,
    channel: f.channel,
    branch_id: isSuper ? f.branch_id : undefined,
    q: f.q,
    from: f.from,
    to: f.to,
    sort: f.sort,
    page: f.page,
    limit: 20,
  });
  // Badge on the "Needs action" tab.
  const { data: pendingCount } = useGetOrdersQuery({
    status: 'pending', channel: 'online', branch_id: isSuper ? f.branch_id : undefined, limit: 1,
  });

  const hasFilters = ['payment_method', 'channel', 'branch_id', 'q', 'from', 'to', 'sort'].some((k) => f[k]);

  const columns = [
    {
      key: 'order', header: 'Order',
      render: (o) => (
        <div>
          <Link to={orderHref(o)} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-[13px] font-semibold text-primary hover:underline">{o.order_number}</Link>
          <p className="text-xs text-slate-500">{CHANNEL[o.channel] || o.channel}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', className: 'whitespace-nowrap text-slate-600', render: (o) => formatDateTime(o.created_at) },
    {
      key: 'customer', header: 'Customer',
      render: (o) => {
        const callToConfirm = o.status === 'pending' && o.payment_method === 'cod' && o.channel === 'online';
        return (
          <div className="min-w-[10rem]">
            <p className="font-medium text-slate-900">{o.customer_name || 'Walk-in customer'}</p>
            {o.customer_phone && <p className="text-xs text-slate-500">{formatPhone(o.customer_phone)}</p>}
            {callToConfirm && o.customer_phone && (
              <a href={`tel:${o.customer_phone}`} onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-600/30 hover:bg-amber-200">
                <Phone className="h-3 w-3" />Call to confirm
              </a>
            )}
          </div>
        );
      },
    },
    { key: 'items', header: 'Items', className: 'text-center', headerClassName: 'text-center', render: (o) => o.item_count },
    { key: 'total', header: 'Total', className: 'whitespace-nowrap text-right font-semibold', headerClassName: 'text-right', render: (o) => formatBDT(o.total_amount) },
    { key: 'payment', header: 'Payment', render: (o) => <PaymentCell method={o.payment_method} status={o.payment_status} /> },
    { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} /> },
    { key: 'branch', header: 'Branch', className: 'whitespace-nowrap text-slate-600', render: (o) => o.branch_name || '—' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Website orders and in-store sales. Open an order to confirm, ship or cancel it." />

      <Tabs label="Order status" value={f.tab} onChange={(tab) => setF({ tab })}
        tabs={TABS.map((t) => (t.value === 'pending' ? { ...t, count: pendingCount?.pagination?.total } : t))} />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <SearchBox key={searchKey} id="orders-q" label="Search" value={f.q} onSearch={(q) => setF({ q })}
          placeholder="Order no., phone or name" className="w-full sm:w-64" />
        {f.tab === 'closed' && (
          <FilterField label="Show" htmlFor="orders-closed">
            <Select id="orders-closed" value={f.closed} onChange={(e) => setF({ closed: e.target.value })} className="w-36">
              <option value="cancelled">Cancelled</option>
              <option value="returned">Returned</option>
            </Select>
          </FilterField>
        )}
        <FilterField label="Payment" htmlFor="orders-pm">
          <Select id="orders-pm" value={f.payment_method || ''} onChange={(e) => setF({ payment_method: e.target.value })} className="w-44">
            <option value="">Any payment</option>
            {Object.entries(PAYMENT_METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Channel" htmlFor="orders-channel">
          <Select id="orders-channel" value={f.channel || ''} onChange={(e) => setF({ channel: e.target.value })} className="w-40">
            <option value="">Website + store</option>
            <option value="online">Website</option>
            <option value="pos">In store</option>
          </Select>
        </FilterField>
        {isSuper && <BranchFilter id="orders-branch" value={f.branch_id} onChange={(branch_id) => setF({ branch_id })} className="w-44" />}
        <DateRange idPrefix="orders" from={f.from} to={f.to} onChange={({ from, to }) => setF({ from, to })} />
        <FilterField label="Sort" htmlFor="orders-sort">
          <Select id="orders-sort" value={f.sort || ''} onChange={(e) => setF({ sort: e.target.value })} className="w-40">
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="total_desc">Highest total</option>
            <option value="total_asc">Lowest total</option>
          </Select>
        </FilterField>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="mb-0.5"
            onClick={() => { setF({ payment_method: '', channel: '', branch_id: '', q: '', from: '', to: '', sort: '' }); setSearchKey((k) => k + 1); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" />Clear filters
          </Button>
        )}
      </div>

      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
        <DataTable columns={columns} rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null}
          onRetry={refetch} onRowClick={(o) => navigate(orderHref(o))} empty={EMPTY[f.tab] || EMPTY.all} />
      </div>
      <Pagination pagination={data?.pagination} onPage={(page) => setF({ page }, { keepPage: true })} />
    </div>
  );
};

export default OrdersPage;
