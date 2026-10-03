import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import {
  Field, MoneyInput, Select, TextArea, TextInput,
} from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { BranchFilter, Notice, UnitStatusBadge } from '@/components/admin/ops/OpsUi';
import { VariantPicker } from '@/components/admin/ops/VariantPicker';
import { UNIT_STATUS, UNIT_TRANSITIONS } from '@/components/admin/ops/labels';
import { useCreateUnitMutation, useUpdateUnitMutation } from '@/store/api/opsApi';
import { useToast } from '@/hooks/useToast';
import { errorText } from '@/lib/apiError';

const GRADES = ['A+', 'A', 'B+', 'B', 'C'];

/** '' → null; otherwise a number (NaN if not numeric). */
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const badMoney = (n) => n !== null && (!Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100);
const badBattery = (n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 100);

/** What a status change does to stock (mirrors updateUnit in inventory.service.js). */
const STATUS_EFFECT = {
  'in_stock>sold': "Stock doesn't change. POS sales mark serials sold automatically; if this laptop was sold some other way, also remove 1 with Adjust on the Stock tab.",
  'in_stock>written_off': 'Removes 1 from stock at this branch. Not possible if the remaining stock is reserved for website orders.',
  'sold>returned': "Records that the customer brought it back. Stock doesn't change.",
  'returned>in_stock': "Stock doesn't change. To put it back on sale, also add 1 with Adjust on the Stock tab (reason: Customer return).",
  'returned>written_off': "Stock doesn't change (a returned unit isn't counted in stock).",
  'written_off>in_stock': "Stock doesn't change. If you found it, also add 1 with Adjust on the Stock tab (reason: Count correction).",
};

const UnitFields = ({ v, set, errors }) => (
  <>
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Grade" hint="A+ = like new">
        {(id) => (
          <>
            <TextInput id={id} list="ops-grades" value={v.condition_grade} maxLength={20} onChange={(e) => set({ condition_grade: e.target.value })} />
            <datalist id="ops-grades">{GRADES.map((g) => <option key={g} value={g} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Battery health (%)" error={errors.battery_health}>
        {(id) => <TextInput id={id} type="number" min="0" max="100" step="1" inputMode="numeric" value={v.battery_health} onChange={(e) => set({ battery_health: e.target.value })} />}
      </Field>
      <div />
      <Field label="Cost price" error={errors.cost_price} hint="What the shop paid">
        {(id) => <MoneyInput id={id} value={v.cost_price} onChange={(e) => set({ cost_price: e.target.value })} />}
      </Field>
      <Field label="Listed price" error={errors.listed_price} hint="Asking price for this unit">
        {(id) => <MoneyInput id={id} value={v.listed_price} onChange={(e) => set({ listed_price: e.target.value })} />}
      </Field>
    </div>
    <Field label="Cosmetic condition" hint="Scratches, dents, screen marks, missing keys…">
      {(id) => <TextArea id={id} rows={2} maxLength={2000} value={v.cosmetic_notes} onChange={(e) => set({ cosmetic_notes: e.target.value })} />}
    </Field>
    <Field label="Other notes">
      {(id) => <TextArea id={id} rows={2} maxLength={2000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Bought from a customer, charger included" />}
    </Field>
  </>
);

const checkFields = (v) => {
  const e = {};
  if (badBattery(numOrNull(v.battery_health))) e.battery_health = 'Enter a whole number from 0 to 100';
  if (badMoney(numOrNull(v.cost_price))) e.cost_price = 'Enter an amount (up to 2 decimals)';
  if (badMoney(numOrNull(v.listed_price))) e.listed_price = 'Enter an amount (up to 2 decimals)';
  return e;
};

// ─── Receive a used laptop (register serial, +1 stock) ─────

export const ReceiveUnitModal = ({ defaultBranch, onClose }) => {
  const toast = useToast();
  const user = useSelector((s) => s.auth.user);
  const [branchId, setBranchId] = useState(defaultBranch || '');
  const [variant, setVariant] = useState(null);
  const [serial, setSerial] = useState('');
  const [v, setV] = useState({ condition_grade: '', battery_health: '', cost_price: '', listed_price: '', cosmetic_notes: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [create, { isLoading }] = useCreateUnitMutation();
  const effectiveBranch = user?.role === 'super_admin' ? branchId : user?.branch_id;
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const fieldErrors = checkFields(v);
    if (!serial.trim()) fieldErrors.serial = 'Enter the serial number (on the sticker under the laptop)';
    setErrors(fieldErrors);
    if (!effectiveBranch) return setErr('Choose a branch.');
    if (!variant) return setErr('Search for the product and pick it from the list.');
    if (Object.keys(fieldErrors).length) return setErr(null);
    setErr(null);
    const body = {
      variant_id: variant.variant_id,
      branch_id: effectiveBranch,
      serial_number: serial.trim(),
      condition_grade: v.condition_grade.trim() || undefined,
      battery_health: numOrNull(v.battery_health) ?? undefined,
      cosmetic_notes: v.cosmetic_notes.trim() || undefined,
      cost_price: numOrNull(v.cost_price) ?? undefined,
      listed_price: numOrNull(v.listed_price) ?? undefined,
      notes: v.notes.trim() || undefined,
    };
    try {
      const unit = await create(body).unwrap();
      toast.success(`Serial ${unit.serial_number} received at ${unit.branch_name} — stock +1`);
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Receive used laptop" description="Registers the laptop's serial number and adds 1 to stock at the branch."
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button type="submit" form="receive-unit-form" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Receive (+1 stock)</Button>
      </>}>
      <form id="receive-unit-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchFilter id="unit-branch" label="Branch" allowAll={false} value={branchId} onChange={(b) => { setBranchId(b); setVariant(null); }} />
          <Field label="Serial number" required error={errors.serial}>
            {(id) => <TextInput id={id} value={serial} maxLength={120} onChange={(e) => setSerial(e.target.value)} className="font-mono" placeholder="e.g. 5CD1234XYZ" />}
          </Field>
        </div>
        <VariantPicker branchId={effectiveBranch} value={variant} onChange={setVariant} label="Product (model and configuration)" autoFocus />
        <UnitFields v={v} set={set} errors={errors} />
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};

// ─── Edit a unit (details and status) ──────────────────────

const str = (x) => (x === null || x === undefined ? '' : String(x));

export const EditUnitModal = ({ unit, onClose }) => {
  const toast = useToast();
  const initial = {
    serial_number: unit.serial_number,
    condition_grade: str(unit.condition_grade),
    battery_health: str(unit.battery_health),
    cost_price: unit.cost_price == null ? '' : String(Number(unit.cost_price)),
    listed_price: unit.listed_price == null ? '' : String(Number(unit.listed_price)),
    cosmetic_notes: str(unit.cosmetic_notes),
    notes: str(unit.notes),
  };
  const [v, setV] = useState(initial);
  const [status, setStatus] = useState(unit.status);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [update, { isLoading }] = useUpdateUnitMutation();
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));
  const nextStatuses = UNIT_TRANSITIONS[unit.status] || [];
  const effect = status !== unit.status ? STATUS_EFFECT[`${unit.status}>${status}`] : null;

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const fieldErrors = checkFields(v);
    if (!v.serial_number.trim()) fieldErrors.serial = 'Serial number is required';
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    const body = {};
    if (v.serial_number.trim() !== initial.serial_number) body.serial_number = v.serial_number.trim();
    for (const k of ['condition_grade', 'cosmetic_notes', 'notes']) {
      if (v[k].trim() !== initial[k]) body[k] = v[k].trim() || null;
    }
    for (const k of ['battery_health', 'cost_price', 'listed_price']) {
      if (v[k] !== initial[k]) body[k] = numOrNull(v[k]);
    }
    if (status !== unit.status) {
      body.status = status;
      if (note.trim()) body.note = note.trim();
    }
    if (!Object.keys(body).length) return onClose();
    setErr(null);
    try {
      await update({ id: unit.id, ...body }).unwrap();
      toast.success(body.status ? `Serial ${v.serial_number} marked ${UNIT_STATUS[status].label.toLowerCase()}` : 'Unit details saved');
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`Serial ${unit.serial_number}`} description={`${unit.product_name} · ${unit.variant_name} · ${unit.branch_name}`}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button type="submit" form="edit-unit-form" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
      </>}>
      <form id="edit-unit-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Serial number" required error={errors.serial}>
            {(id) => <TextInput id={id} value={v.serial_number} maxLength={120} onChange={(e) => set({ serial_number: e.target.value })} className="font-mono" />}
          </Field>
          <Field label="Status" hint={nextStatuses.length ? undefined : 'No status change possible'}>
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)} disabled={!nextStatuses.length}>
                <option value={unit.status}>{UNIT_STATUS[unit.status]?.label || unit.status} (now)</option>
                {nextStatuses.map((s) => <option key={s} value={s}>{UNIT_STATUS[s]?.label || s}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {effect && (
          <Notice tone={status === 'written_off' && unit.status === 'in_stock' ? 'warn' : 'info'} title={<span className="inline-flex items-center gap-2"><UnitStatusBadge status={unit.status} />→<UnitStatusBadge status={status} /></span>}>
            <p>{effect}</p>
          </Notice>
        )}
        {effect && (
          <Field label="Reason (optional)" hint="Saved in the stock history">
            {(id) => <TextInput id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        )}
        <UnitFields v={v} set={set} errors={errors} />
        {err && <Notice tone="danger">{err}</Notice>}
      </form>
    </Modal>
  );
};
