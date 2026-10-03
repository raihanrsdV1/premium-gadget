import React, { useCallback, useState } from 'react';
import { Info, Pencil } from 'lucide-react';
import { DataTable, Pagination } from '@/components/admin/DataTable';
import { Select } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import {
  BranchFilter, FilterField, SearchBox, UnitStatusBadge,
} from '@/components/admin/ops/OpsUi';
import { UNIT_STATUS } from '@/components/admin/ops/labels';
import { useGetUnitsQuery } from '@/store/api/opsApi';
import { formatBDT, formatDate } from '@/lib/format';
import { errorText } from '@/lib/apiError';
import { EditUnitModal } from './UnitModals';

/** Serial register for individual (mostly used) laptops. */
const UnitsTab = ({ f, setF, isSuper }) => {
  const [editing, setEditing] = useState(null);
  const close = useCallback(() => setEditing(null), []);
  const { data, isLoading, isFetching, error, refetch } = useGetUnitsQuery({
    branch_id: isSuper ? f.branch_id : undefined,
    status: f.status,
    q: f.uq,
    page: f.page,
    limit: 25,
  });

  const columns = [
    { key: 'serial', header: 'Serial no.', render: (u) => <span className="font-mono text-[13px] font-semibold">{u.serial_number}</span> },
    {
      key: 'product', header: 'Product',
      render: (u) => (
        <div className="min-w-[12rem]">
          <p className="font-medium text-slate-900">{u.product_name}</p>
          <p className="text-xs text-slate-500">{u.variant_name} · <span className="font-mono">{u.sku}</span></p>
        </div>
      ),
    },
    { key: 'branch', header: 'Branch', className: 'whitespace-nowrap text-slate-600', render: (u) => u.branch_name },
    { key: 'grade', header: 'Grade', render: (u) => u.condition_grade || '—' },
    { key: 'battery', header: 'Battery', className: 'text-right', headerClassName: 'text-right', render: (u) => (u.battery_health != null ? `${u.battery_health}%` : '—') },
    { key: 'cost', header: 'Cost', className: 'whitespace-nowrap text-right text-slate-600', headerClassName: 'text-right', render: (u) => formatBDT(u.cost_price) },
    { key: 'listed', header: 'Listed price', className: 'whitespace-nowrap text-right', headerClassName: 'text-right', render: (u) => formatBDT(u.listed_price) },
    { key: 'status', header: 'Status', render: (u) => <UnitStatusBadge status={u.status} /> },
    { key: 'received', header: 'Received', className: 'whitespace-nowrap text-slate-600', render: (u) => formatDate(u.received_at) },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>,
      render: (u) => (
        <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setEditing(u)} aria-label={`Edit unit ${u.serial_number}`}>
          <Pencil className="mr-1 h-3.5 w-3.5" />Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <SearchBox id="units-q" label="Search" value={f.uq} onSearch={(uq) => setF({ uq })} placeholder="Serial no., product or SKU" className="w-full sm:w-72" />
        <BranchFilter id="units-branch" value={f.branch_id} onChange={(branch_id) => setF({ branch_id })} className="w-48" />
        <FilterField label="Status" htmlFor="units-status">
          <Select id="units-status" value={f.status || ''} onChange={(e) => setF({ status: e.target.value })} className="w-40">
            <option value="">Any status</option>
            {Object.entries(UNIT_STATUS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </FilterField>
      </div>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>The serial register records each laptop&apos;s serial and condition. Stock numbers come from the Stock tab: receiving a unit adds 1, writing one off removes 1, and other status changes don&apos;t change stock.</span>
      </p>
      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
        <DataTable dense columns={columns} rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch}
          empty={f.uq || f.status ? 'No serial units match these filters.' : 'No serial units yet. Use "Receive used laptop (serial)".'} />
      </div>
      <Pagination pagination={data?.pagination} onPage={(page) => setF({ page }, { keepPage: true })} />
      {editing && <EditUnitModal unit={editing} onClose={close} />}
    </div>
  );
};

export default UnitsTab;
