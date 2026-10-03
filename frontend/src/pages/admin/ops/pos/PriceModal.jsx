import React, { useState } from 'react';
import { Modal } from '@/components/admin/Modal';
import { Field, MoneyInput, TextInput } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/admin/ops/OpsUi';
import { formatBDT } from '@/lib/format';

/**
 * Change one cart line's unit price. A different price needs a reason; for
 * branch staff the API refuses anything below `min_staff_price`
 * (POS_MAX_STAFF_DISCOUNT_PCT, default 10 %).
 */
const PriceModal = ({ line, pct, onSave, onClose }) => {
  const list = Number(line.list_price);
  const [price, setPrice] = useState(String(line.override ? line.override.price : list));
  const [reason, setReason] = useState(line.override?.reason || '');
  const [err, setErr] = useState(null);
  const min = line.min_staff_price != null ? Number(line.min_staff_price) : null;
  const n = Number(price);
  const belowMin = min != null && Number.isFinite(n) && n < min;

  const submit = (e) => {
    e.preventDefault();
    if (!Number.isFinite(n) || n <= 0) return setErr('Enter a price above 0.');
    if (Math.round(n * 100) !== n * 100) return setErr('Use at most 2 decimals.');
    if (n === list) { onSave(null); return undefined; }
    if (reason.trim().length < 3) return setErr('Write why the price is different (at least 3 letters).');
    onSave({ price: n, reason: reason.trim() });
    return undefined;
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Change price" description={`${line.product_name} · ${line.variant_name}`}
      footer={<>
        {line.override && <Button type="button" variant="ghost" onClick={() => onSave(null)}>Back to {formatBDT(list)}</Button>}
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="pos-price-form">Use this price</Button>
      </>}>
      <form id="pos-price-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">Shop price: <b>{formatBDT(list)}</b> each</p>
        <Field label="New price (each)" required
          hint={min != null ? `Lowest you can give: ${formatBDT(min)} (max ${pct ?? 10}% staff discount)` : 'Super admin: no limit'}>
          {(id) => <MoneyInput id={id} value={price} onChange={(e) => { setPrice(e.target.value); setErr(null); }} autoFocus min="1" />}
        </Field>
        {belowMin && (
          <Notice tone="warn">Below the lowest staff price ({formatBDT(min)}). The sale will be refused — ask a super admin.</Notice>
        )}
        <Field label="Reason" required hint="e.g. Matched a competitor's price, minor scratch">
          {(id) => <TextInput id={id} value={reason} maxLength={255} onChange={(e) => { setReason(e.target.value); setErr(null); }} />}
        </Field>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      </form>
    </Modal>
  );
};

export default PriceModal;
