import React, { useCallback, useState } from 'react';
import { ArrowLeftRight, ClipboardList, History, Info, Plus, Trash2 } from 'lucide-react';
import { DataTable, Pagination } from '@/components/admin/DataTable';
import { Checkbox } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { BranchFilter, SearchBox } from '@/components/admin/ops/OpsUi';
import { useDeleteInventoryMutation, useGetInventoryQuery } from '@/store/api/opsApi';
import { useGetBranchesAdminQuery } from '@/store/api/commonApi';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { formatBDT } from '@/lib/format';
import { errorText } from '@/lib/apiError';
import {
  AdjustModal, HistoryModal, SetCountModal, TransferModal,
} from './StockModals';

const ActionButton = ({ icon: Icon, children, ...props }) => (
  <Button type="button" variant="outline" size="sm" className="h-8 justify-start px-2 text-xs" {...props}>
    <Icon className="mr-1 h-3.5 w-3.5" />{children}
  </Button>
);

const StockTab = ({ f, setF, isSuper }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(null); // { kind, row }
  const close = useCallback(() => setModal(null), []);
  const { data: branches = [] } = useGetBranchesAdminQuery();
  const activeBranches = branches.filter((b) => b.is_active);
  const [remove] = useDeleteInventoryMutation();

  const { data, isLoading, isFetching, error, refetch } = useGetInventoryQuery({
    branch_id: isSuper ? f.branch_id : undefined,
    q: f.q,
    low_stock: f.low ? 'true' : undefined,
    page: f.page,
    limit: 25,
  });

  const onRemove = async (row) => {
    const ok = await confirm({
      title: 'Remove this stock record?',
      body: `${row.product_name} (${row.variant_name}) will no longer be listed at ${row.branch_name}. Its stock history is kept.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(row.id).unwrap();
      toast.success('Stock record removed');
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const columns = [
    {
      key: 'product', header: 'Product',
      render: (r) => (
        <div className="min-w-[14rem]">
          <p className="font-medium text-slate-900">{r.product_name}</p>
          <p className="text-xs text-slate-500">{r.variant_name} · <span className="font-mono">{r.sku}</span></p>
          {!r.sellable_online && <p className="text-xs text-amber-700">Hidden from the website</p>}
        </div>
      ),
    },
    { key: 'branch', header: 'Branch', className: 'whitespace-nowrap text-slate-600', render: (r) => r.branch_name },
    { key: 'qty', header: 'In stock', className: 'text-right tabular-nums', headerClassName: 'text-right', render: (r) => r.quantity },
    {
      key: 'reserved', header: <span title="Held for website orders that are not paid or confirmed yet">Reserved</span>,
      className: 'text-right tabular-nums', headerClassName: 'text-right',
      render: (r) => (r.reserved > 0 ? <span className="font-medium text-amber-700" title="Held for unpaid / unconfirmed website orders">{r.reserved}</span> : <span className="text-slate-400">0</span>),
    },
    {
      key: 'available', header: 'Available', className: 'text-right tabular-nums', headerClassName: 'text-right',
      render: (r) => (
        <span className={`font-semibold ${r.available <= 0 ? 'text-red-600' : r.is_low_stock ? 'text-amber-700' : 'text-slate-900'}`}>
          {r.available}{r.is_low_stock && <span className="ml-1 text-[11px] font-medium">{r.available <= 0 ? 'out' : 'low'}</span>}
        </span>
      ),
    },
    { key: 'low', header: <span title="Marked low when available is at or below this">Low-stock level</span>, className: 'text-right tabular-nums text-slate-600', headerClassName: 'text-right', render: (r) => r.low_stock_threshold },
    { key: 'cost', header: 'Cost', className: 'whitespace-nowrap text-right text-slate-600', headerClassName: 'text-right', render: (r) => formatBDT(r.cost_price) },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>,
      render: (r) => (
        <div className="grid min-w-[11.5rem] grid-cols-2 gap-1.5">
          <ActionButton icon={Plus} onClick={() => setModal({ kind: 'adjust', row: r })} aria-label={`Adjust stock of ${r.sku} at ${r.branch_name}`}>Adjust</ActionButton>
          <ActionButton icon={ClipboardList} onClick={() => setModal({ kind: 'count', row: r })} aria-label={`Set exact count of ${r.sku} at ${r.branch_name}`}>Count</ActionButton>
          <ActionButton icon={ArrowLeftRight} onClick={() => setModal({ kind: 'transfer', row: r })} disabled={r.available <= 0 || activeBranches.length < 2}
            title={r.available <= 0 ? 'Nothing available to move' : undefined} aria-label={`Transfer ${r.sku} from ${r.branch_name}`}>Transfer</ActionButton>
          <ActionButton icon={History} onClick={() => setModal({ kind: 'history', row: r })} aria-label={`Stock history of ${r.sku} at ${r.branch_name}`}>History</ActionButton>
          {isSuper && r.quantity === 0 && r.reserved === 0 && (
            <Button type="button" variant="ghost" size="sm" className="col-span-2 h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onRemove(r)}
              aria-label={`Remove empty stock record ${r.sku} at ${r.branch_name}`}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />Remove empty record
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <SearchBox id="inv-q" label="Search" value={f.q} onSearch={(q) => setF({ q })} placeholder="Product name or SKU" className="w-full sm:w-72" />
        <BranchFilter id="inv-branch" value={f.branch_id} onChange={(branch_id) => setF({ branch_id })} className="w-48" />
        <div className="pb-2">
          <Checkbox label="Low stock only" checked={f.low === '1'} onChange={(v) => setF({ low: v ? '1' : '' })} />
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span><b>Reserved</b> units are held for website orders that are not paid or confirmed yet. <b>Available</b> = in stock − reserved; only available units can be sold in store or moved.</span>
      </p>

      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
        <DataTable dense columns={columns} rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch}
          empty={f.q ? `Nothing in stock matches "${f.q}".` : f.low ? 'No low-stock items right now.' : 'No stock records yet. Use "Add product to a branch".'} />
      </div>
      <Pagination pagination={data?.pagination} onPage={(page) => setF({ page }, { keepPage: true })} />

      {modal?.kind === 'adjust' && <AdjustModal row={modal.row} onClose={close} />}
      {modal?.kind === 'count' && <SetCountModal row={modal.row} onClose={close} />}
      {modal?.kind === 'transfer' && <TransferModal row={modal.row} branches={activeBranches} onClose={close} />}
      {modal?.kind === 'history' && <HistoryModal row={modal.row} onClose={close} />}
    </div>
  );
};

export default StockTab;
