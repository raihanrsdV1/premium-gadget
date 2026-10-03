import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Pagination } from '@/components/admin/DataTable';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { BranchFilter, Notice } from '@/components/admin/ops/OpsUi';
import { VariantPicker } from '@/components/admin/ops/VariantPicker';
import { ADJUST_REASONS } from '@/components/admin/ops/labels';
import {
  useAdjustInventoryMutation, useCreateInventoryMutation, useGetInventoryRowQuery, useGetMovementsQuery,
  useTransferStockMutation, useUpdateInventoryMutation,
} from '@/store/api/opsApi';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { errorText } from '@/lib/apiError';
import MovementsTable from './MovementsTable';

const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const isWhole = (n) => Number.isInteger(n) && n >= 0;

const RowSummary = ({ row }) => (
  <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
    <p className="font-medium text-slate-900">{row.product_name}</p>
    <p className="text-xs text-slate-600">{row.variant_name} · <span className="font-mono">{row.sku}</span> · {row.branch_name}</p>
    <p className="mt-1 text-xs text-slate-700">
      In stock <b>{row.quantity}</b> · Reserved <b>{row.reserved}</b> · Available <b>{row.available}</b>
    </p>
  </div>
);

const Footer = ({ formId, saving, label, onClose, danger }) => (
  <>
    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
    <Button type="submit" form={formId} disabled={saving} variant={danger ? 'destructive' : 'default'}>
      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{label}
    </Button>
  </>
);

// ─── Adjust (+/− with a reason) ─────────────────────────────

export const AdjustModal = ({ row, onClose }) => {
  const toast = useToast();
  const [dir, setDir] = useState('add');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('received');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [adjust, { isLoading }] = useAdjustInventoryMutation();

  const n = int(qty);
  const delta = dir === 'add' ? n : -n;
  const after = row.quantity + (Number.isFinite(delta) ? delta : 0);
  const maxRemove = Math.max(0, row.quantity - row.reserved);

  const pickDir = (d) => {
    setDir(d);
    setReason(d === 'add' ? 'received' : 'damaged');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    if (!Number.isInteger(n) || n < 1) return setErr('Enter how many units (1 or more).');
    if (dir === 'remove' && n > maxRemove) {
      return setErr(row.reserved > 0
        ? `You can remove at most ${maxRemove}: ${row.reserved} unit(s) are reserved for website orders.`
        : `Only ${row.quantity} unit(s) in stock.`);
    }
    setErr(null);
    try {
      await adjust({ id: row.id, delta, reason, note: note.trim() || undefined }).unwrap();
      toast.success(`Stock ${dir === 'add' ? 'increased' : 'reduced'}: ${row.sku} now ${after} at ${row.branch_name}`);
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} title="Adjust stock" footer={<Footer formId="adjust-form" saving={isLoading} label="Save adjustment" onClose={onClose} />}>
      <form id="adjust-form" onSubmit={submit} className="space-y-4" noValidate>
        <RowSummary row={row} />
        <div role="radiogroup" aria-label="Add or remove" className="grid grid-cols-2 gap-2">
          {[['add', 'Add units', Plus], ['remove', 'Remove units', Minus]].map(([v, label, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={dir === v} onClick={() => pickDir(v)}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium ${dir === v
                ? (v === 'add' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-400 bg-red-50 text-red-800')
                : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How many?" required hint={`After: ${Number.isFinite(after) ? after : row.quantity} in stock`}>
            {(id) => <TextInput id={id} type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}
          </Field>
          <Field label="Reason" required>
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {ADJUST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Note (optional)" hint="e.g. supplier invoice no., what happened">
          {(id) => <TextArea id={id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};

// ─── Set exact count (stock take) ──────────────────────────

export const SetCountModal = ({ row, onClose }) => {
  const toast = useToast();
  const [qty, setQty] = useState(String(row.quantity));
  const [low, setLow] = useState(String(row.low_stock_threshold));
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [update, { isLoading }] = useUpdateInventoryMutation();

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const q = int(qty);
    const l = int(low);
    if (!isWhole(q)) return setErr('Enter the number of units you counted (0 or more).');
    if (!isWhole(l)) return setErr('Low-stock level must be 0 or more.');
    if (q < row.reserved) return setErr(`The count can't be below ${row.reserved}: that many are reserved for website orders. Cancel those orders first if the stock is really gone.`);
    const body = {};
    if (q !== row.quantity) body.quantity = q;
    if (l !== row.low_stock_threshold) body.low_stock_threshold = l;
    if (!Object.keys(body).length) return onClose();
    setErr(null);
    try {
      await update({ id: row.id, ...body, note: note.trim() || undefined }).unwrap();
      toast.success(body.quantity !== undefined ? `Count saved: ${row.sku} is now ${q} at ${row.branch_name}` : 'Low-stock level saved');
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} title="Set exact count" description="Use after counting the shelf. The difference is recorded in the stock history."
      footer={<Footer formId="count-form" saving={isLoading} label="Save count" onClose={onClose} />}>
      <form id="count-form" onSubmit={submit} className="space-y-4" noValidate>
        <RowSummary row={row} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Units on hand (counted)" required
            hint={row.reserved > 0 ? `Can't be below ${row.reserved} (reserved for website orders)` : 'Everything physically at this branch'}>
            {(id) => <TextInput id={id} type="number" min={row.reserved} step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}
          </Field>
          <Field label="Low-stock alert level" hint="Marked low when available is at or below this">
            {(id) => <TextInput id={id} type="number" min="0" step="1" inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} />}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(id) => <TextArea id={id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Monthly stock count" />}
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};

// ─── Transfer to another branch ────────────────────────────

export const TransferModal = ({ row, branches, onClose }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const others = branches.filter((b) => b.id !== row.branch_id);
  const [to, setTo] = useState(others[0]?.id || '');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [unitIds, setUnitIds] = useState([]);
  const [err, setErr] = useState(null);
  const [transfer, { isLoading }] = useTransferStockMutation();
  const { data: detail } = useGetInventoryRowQuery(row.id);
  const units = detail?.units || [];
  const toName = others.find((b) => b.id === to)?.name || 'the other branch';

  const toggleUnit = (id, on) => setUnitIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const n = int(qty);
    if (!to) return setErr('Choose where the stock goes.');
    if (!Number.isInteger(n) || n < 1) return setErr('Enter how many units to move (1 or more).');
    if (n > row.available) return setErr(`Only ${row.available} unit(s) are available to move${row.reserved ? ` (${row.reserved} reserved for website orders)` : ''}.`);
    if (unitIds.length > n) return setErr(`You picked ${unitIds.length} serial units but are moving only ${n}.`);
    setErr(null);
    const ok = await confirm({
      title: `Move ${n} to ${toName}?`,
      body: `${n} × ${row.product_name} (${row.variant_name}) leaves ${row.branch_name} now and is added to ${toName}. Make sure the items travel with this record.`,
      confirmLabel: 'Move stock',
    });
    if (!ok) return;
    try {
      await transfer({
        variant_id: row.variant_id, from_branch_id: row.branch_id, to_branch_id: to, quantity: n,
        unit_ids: unitIds.length ? unitIds : undefined, note: note.trim() || undefined,
      }).unwrap();
      toast.success(`Moved ${n} × ${row.sku} to ${toName}`);
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} title="Transfer to another branch"
      footer={<Footer formId="transfer-form" saving={isLoading} label="Move stock" onClose={onClose} />}>
      <form id="transfer-form" onSubmit={submit} className="space-y-4" noValidate>
        <RowSummary row={row} />
        {others.length === 0 ? (
          <Notice tone="warn">There is no other open branch to move stock to.</Notice>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="To branch" required>
              {(id) => (
                <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                  {others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="How many?" required hint={`Up to ${row.available} available`}>
              {(id) => <TextInput id={id} type="number" min="1" max={row.available} step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}
            </Field>
          </div>
        )}
        {units.length > 0 && (
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Serial units travelling (optional)</legend>
            {units.map((u) => (
              <Checkbox key={u.id} checked={unitIds.includes(u.id)} onChange={(on) => toggleUnit(u.id, on)}
                label={<span className="font-mono">{u.serial_number}</span>}
                hint={[u.condition_grade && `Grade ${u.condition_grade}`, u.battery_health != null && `Battery ${u.battery_health}%`].filter(Boolean).join(' · ') || undefined} />
            ))}
          </fieldset>
        )}
        <Field label="Note (optional)">
          {(id) => <TextArea id={id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer wants to see it at WASA" />}
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};

// ─── History for one stock row ─────────────────────────────

export const HistoryModal = ({ row, onClose }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useGetMovementsQuery({
    variant_id: row.variant_id, branch_id: row.branch_id, page, limit: 15,
  });
  return (
    <Modal open onClose={onClose} size="xl" title="Stock history" description={`${row.product_name} · ${row.variant_name} · ${row.sku} · ${row.branch_name}`}>
      <MovementsTable compact rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch} />
      <Pagination pagination={data?.pagination} onPage={setPage} />
    </Modal>
  );
};

// ─── Add a product to a branch (new stock row) ─────────────

export const AddToBranchModal = ({ defaultBranch, onClose }) => {
  const toast = useToast();
  const user = useSelector((s) => s.auth.user);
  const [branchId, setBranchId] = useState(defaultBranch || '');
  const [variant, setVariant] = useState(null);
  const [qty, setQty] = useState('1');
  const [low, setLow] = useState('1');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [create, { isLoading }] = useCreateInventoryMutation();
  const effectiveBranch = user?.role === 'super_admin' ? branchId : user?.branch_id;

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const q = int(qty);
    const l = int(low);
    if (!effectiveBranch) return setErr('Choose a branch.');
    if (!variant) return setErr('Search for the product and pick it from the list.');
    if (!isWhole(q)) return setErr('Quantity must be 0 or more.');
    if (!isWhole(l)) return setErr('Low-stock level must be 0 or more.');
    setErr(null);
    try {
      const res = await create({
        variant_id: variant.variant_id, branch_id: effectiveBranch, quantity: q, low_stock_threshold: l,
        note: note.trim() || undefined,
      }).unwrap();
      toast.success(`${variant.sku} added to ${res.branch_name} with ${q} in stock`);
      onClose();
    } catch (error) {
      setErr(error?.status === 409 ? `${errorText(error)}.` : errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} title="Add product to a branch" description="Start keeping stock of a product at a branch. To add units to a product already listed, use Adjust on its row."
      footer={<Footer formId="add-stock-form" saving={isLoading} label="Add to branch" onClose={onClose} />}>
      <form id="add-stock-form" onSubmit={submit} className="space-y-4" noValidate>
        <BranchFilter id="add-stock-branch" label="Branch" allowAll={false} value={branchId} onChange={(v) => { setBranchId(v); setVariant(null); }} />
        <VariantPicker branchId={effectiveBranch} value={variant} onChange={setVariant} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Units on hand" required>
            {(id) => <TextInput id={id} type="number" min="0" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}
          </Field>
          <Field label="Low-stock alert level">
            {(id) => <TextInput id={id} type="number" min="0" step="1" inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} />}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(id) => <TextArea id={id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Opening stock" />}
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};
