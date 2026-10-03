import React from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/admin/DataTable';
import { MovementBadge } from '@/components/admin/ops/OpsUi';
import { signed } from '@/components/admin/ops/labels';
import { formatDateTime } from '@/lib/format';

const Reference = ({ m }) => {
  if (m.reference_type === 'order' && m.reference_id) {
    return <Link to={`/admin/orders/${m.reference_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">Open order</Link>;
  }
  return null;
};

/** Stock ledger rows (GET /inventory/movements). `compact` hides product/branch columns. */
const MovementsTable = ({ rows, loading, error, onRetry, compact = false, empty = 'No stock changes recorded.' }) => {
  const columns = [
    { key: 'date', header: 'When', className: 'whitespace-nowrap text-slate-600', render: (m) => formatDateTime(m.created_at) },
    !compact && {
      key: 'product', header: 'Product',
      render: (m) => (
        <div className="min-w-[12rem]">
          <p className="font-medium text-slate-900">{m.product_name}</p>
          <p className="text-xs text-slate-500">{m.variant_name} · <span className="font-mono">{m.sku}</span></p>
        </div>
      ),
    },
    !compact && { key: 'branch', header: 'Branch', className: 'whitespace-nowrap text-slate-600', render: (m) => m.branch_name },
    { key: 'type', header: 'Change', render: (m) => <MovementBadge type={m.movement_type} /> },
    {
      key: 'qty', header: 'Qty', className: 'text-right tabular-nums', headerClassName: 'text-right',
      render: (m) => (
        <span className={`font-semibold ${m.quantity_delta > 0 ? 'text-emerald-700' : m.quantity_delta < 0 ? 'text-red-600' : 'text-slate-500'}`}>
          {signed(m.quantity_delta)}
        </span>
      ),
    },
    {
      key: 'note', header: 'Details',
      render: (m) => (
        <div className="min-w-[10rem] max-w-xs text-xs text-slate-600">
          {m.serial_number && <p>Serial <span className="font-mono">{m.serial_number}</span></p>}
          {m.note && <p className="whitespace-pre-wrap">{m.note}</p>}
          <Reference m={m} />
        </div>
      ),
    },
    { key: 'by', header: 'By', className: 'whitespace-nowrap text-slate-600', render: (m) => m.performed_by_name || 'System' },
  ].filter(Boolean);

  return <DataTable dense columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry} empty={empty} />;
};

export default MovementsTable;
