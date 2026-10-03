import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/admin/ops/OpsUi';
import { COURIERS, PAYMENT_METHOD } from '@/components/admin/ops/labels';
import { formatBDT } from '@/lib/format';

const TRACKING_RE = /^[A-Za-z0-9][A-Za-z0-9 _./#-]*$/;
const MANUAL_METHODS = ['bkash', 'nagad', 'card', 'net_banking', 'cash', 'other'];

const TITLES = {
  shipped: 'Mark as shipped',
  cancel: 'Cancel this order?',
  returned: 'Mark as returned',
  mark_paid: 'Mark as paid and confirm',
  refund: 'Record the refund',
};

/**
 * Forms for the order actions that need input. Mount it only while open so
 * every opening starts blank. `onSubmit(payload)` returns a promise; the
 * modal stays open (and shows the error) if it rejects.
 */
const OrderActionModal = ({ kind, order, onClose, onSubmit }) => {
  const [courier, setCourier] = useState(order.courier || '');
  const [tracking, setTracking] = useState(order.tracking_number || '');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null);

  const paid = ['completed', 'processing'].includes(order.payment_status);
  const committed = order.status !== 'pending';
  const heldPayment = order.payment_status === 'processing';

  const validate = () => {
    const e = {};
    if (kind === 'shipped' && tracking.trim() && !TRACKING_RE.test(tracking.trim())) {
      e.tracking = 'Use letters, numbers, spaces and . _ / # - only';
    }
    if (kind === 'cancel' && note.trim().length < 3) e.note = 'Write a short reason (at least 3 letters)';
    if (kind === 'mark_paid') {
      if (!heldPayment && !method) e.method = 'Choose how the customer paid';
      if (note.trim().length < 3) e.note = 'Write how you checked the payment';
    }
    if (kind === 'refund' && note.trim().length < 3) e.note = 'Write how the money was refunded';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = () => {
    const n = note.trim() || undefined;
    switch (kind) {
      case 'shipped': return { status: 'shipped', courier: courier.trim() || undefined, tracking_number: tracking.trim() || undefined, note: n };
      case 'cancel': return { status: 'cancelled', note: n };
      case 'returned': return { status: 'returned', restock, note: n };
      case 'mark_paid': return { status: 'confirmed', mark_paid: true, payment_method: heldPayment ? undefined : method, note: n };
      case 'refund': return { note: n };
      default: return {};
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSubmit(payload());
    } catch (err) {
      setFailed(err);
      setSaving(false);
    }
  };

  const danger = kind === 'cancel';
  const submitLabel = {
    shipped: 'Mark shipped', cancel: 'Cancel order', returned: 'Mark returned', mark_paid: 'Mark paid & confirm', refund: 'Mark refunded',
  }[kind];

  return (
    <Modal open onClose={onClose} title={TITLES[kind]} description={`Order ${order.order_number} · ${formatBDT(order.total_amount)}`}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>{danger ? 'Keep order' : 'Back'}</Button>
        <Button type="submit" form="order-action-form" variant={danger ? 'destructive' : 'default'} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}
        </Button>
      </>}>
      <form id="order-action-form" onSubmit={submit} className="space-y-4" noValidate>
        {kind === 'shipped' && (
          <>
            <p className="text-sm text-slate-600">Enter the courier booking so the customer can track the parcel.</p>
            <Field label="Courier">
              {(id) => (
                <>
                  <TextInput id={id} list="ops-couriers" value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={60} placeholder="e.g. Steadfast" autoFocus />
                  <datalist id="ops-couriers">{COURIERS.map((c) => <option key={c} value={c} />)}</datalist>
                </>
              )}
            </Field>
            <Field label="Tracking / consignment number" error={errors.tracking}>
              {(id) => <TextInput id={id} value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={100} placeholder="e.g. SF12345678" />}
            </Field>
          </>
        )}

        {kind === 'cancel' && (
          <Notice tone="danger" title="This can't be undone">
            {committed
              ? 'The items go back into stock at their branch.'
              : 'The stock held for this order is released for other customers.'}
            {paid && ' A payment is on file, so the order will be flagged "refund required": refund the customer from the SSLCommerz panel or bKash/Nagad, then record the refund here.'}
          </Notice>
        )}

        {kind === 'returned' && (
          <>
            <p className="text-sm text-slate-600">Use this when the customer sent the parcel back or the courier returned it.</p>
            <Checkbox label="Put items back in stock" checked={restock} onChange={setRestock}
              hint={restock ? 'The items become available to sell again at their branch.' : "Leave this off if the items are damaged; you can adjust stock later in Inventory."} />
            {paid && <Notice tone="warn">A payment is on file — the order will be flagged &ldquo;refund required&rdquo;.</Notice>}
          </>
        )}

        {kind === 'mark_paid' && (
          <>
            <Notice tone="warn">
              {heldPayment
                ? 'SSLCommerz flagged this payment for review. Approve it only after checking the money arrived in the merchant panel.'
                : 'Only do this when the money has really arrived (e.g. a bKash transfer you checked in the merchant app). Confirming takes the items out of stock.'}
            </Notice>
            {!heldPayment && (
              <Field label="How did the customer pay?" required error={errors.method}>
                {(id) => (
                  <Select id={id} value={method} onChange={(e) => setMethod(e.target.value)} autoFocus>
                    <option value="">Choose…</option>
                    {MANUAL_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}
                  </Select>
                )}
              </Field>
            )}
          </>
        )}

        {kind === 'refund' && (
          <p className="text-sm text-slate-600">
            Refund the customer first (SSLCommerz panel, bKash or Nagad app), then record it here. This marks the payment as refunded and adds a note to the order.
          </p>
        )}

        <Field
          label={{
            shipped: 'Note (optional)',
            cancel: 'Reason for cancelling',
            returned: 'Reason (optional)',
            mark_paid: 'Payment reference / note',
            refund: 'Refund reference / note',
          }[kind]}
          required={['cancel', 'mark_paid', 'refund'].includes(kind)}
          error={errors.note}
          hint={kind === 'cancel' ? 'Saved in the order history.' : kind === 'mark_paid' ? 'e.g. bKash TrxID 9XK2… received 12 Oct' : kind === 'refund' ? 'e.g. bKash refund TrxID 7HG1…' : undefined}
        >
          {(id) => <TextArea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus={kind === 'cancel' || kind === 'refund' || (kind === 'mark_paid' && heldPayment)} />}
        </Field>

        {failed && (
          <Notice tone="danger" title={failed.status === 403 ? 'Not allowed' : "Couldn't save"}>
            {failed.message}
          </Notice>
        )}
      </form>
    </Modal>
  );
};

export default OrderActionModal;
