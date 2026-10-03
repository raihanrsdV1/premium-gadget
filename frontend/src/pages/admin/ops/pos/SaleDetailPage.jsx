import React, { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowLeft, Ban, Loader2, Printer,
} from 'lucide-react';
import { Badge, PageHeader } from '@/components/admin/DataTable';
import { Modal } from '@/components/admin/Modal';
import { Field, TextArea } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { InfoRow, Notice, RoleNote } from '@/components/admin/ops/OpsUi';
import { Receipt } from '@/components/admin/ops/Receipt';
import { PrintPortal } from '@/components/admin/ops/PrintPortal';
import { PAYMENT_METHOD, formatPhone } from '@/components/admin/ops/labels';
import { useGetSaleQuery, useVoidSaleMutation } from '@/store/api/opsApi';
import { useGetBranchesAdminQuery } from '@/store/api/commonApi';
import { useToast } from '@/hooks/useToast';
import { formatBDT, formatDateTime } from '@/lib/format';
import { errorText } from '@/lib/apiError';

const BackLink = () => (
  <Link to="/admin/pos/sales" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
    <ArrowLeft className="h-4 w-4" />Sales history
  </Link>
);

/** Void a sale (super admin): reason, then a clear danger confirmation in the same dialog. */
const VoidModal = ({ sale, onClose }) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const [voidSale, { isLoading }] = useVoidSaleMutation();

  const submit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    if (reason.trim().length < 3) { setErr('Write why the sale is being voided (at least 3 letters).'); return; }
    setErr(null);
    try {
      await voidSale({ id: sale.id, reason: reason.trim() }).unwrap();
      toast.success(`Sale ${sale.order_number} voided — items back in stock`);
      onClose();
    } catch (error) {
      setErr(errorText(error));
      toast.error(errorText(error));
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={`Void sale ${sale.order_number}?`}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Keep sale</Button>
        <Button type="submit" form="void-form" variant="destructive" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Void sale
        </Button>
      </>}>
      <form id="void-form" onSubmit={submit} className="space-y-4" noValidate>
        <Notice tone="danger" title="This can't be undone">
          All items go back into stock at {sale.branch_name}, the payment of <b>{formatBDT(sale.total_amount)}</b> is marked refunded
          and the sale drops out of the day&apos;s totals. Give the customer their money back.
        </Notice>
        <Field label="Reason" required>
          {(id) => <TextArea id={id} rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="e.g. Wrong item rung up, customer returned it the same day" />}
        </Field>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      </form>
    </Modal>
  );
};

/** /admin/pos/sales/:id — one counter sale, receipt reprint, void. */
const SaleDetailPage = () => {
  const { id } = useParams();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const { data: sale, isLoading, error, refetch } = useGetSaleQuery(id);
  const { data: branches = [] } = useGetBranchesAdminQuery();
  const [voiding, setVoiding] = useState(false);
  const closeVoid = useCallback(() => setVoiding(false), []);

  if (isLoading) return <div className="flex justify-center py-24 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="space-y-4">
        <BackLink />
        <Notice tone={notFound ? 'warn' : 'danger'} title={notFound ? 'Sale not found' : "Couldn't load this sale"}>
          {notFound ? 'It may belong to another branch, or the link is wrong.' : errorText(error)}
          {!notFound && <div className="mt-2"><Button size="sm" variant="outline" onClick={refetch}>Try again</Button></div>}
        </Notice>
      </div>
    );
  }

  const branch = branches.find((b) => b.id === sale.branch_id);
  const voided = !!sale.voided_at;

  return (
    <div className="space-y-5">
      <BackLink />
      <PageHeader
        title={<span className="font-mono">{sale.order_number}</span>}
        description={`In-store sale · ${formatDateTime(sale.created_at)} · ${sale.branch_name}`}
        actions={<>
          <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print receipt</Button>
          {!voided && (isSuper
            ? <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setVoiding(true)}><Ban className="mr-2 h-4 w-4" />Void sale</Button>
            : <span className="self-center"><RoleNote>Only a super admin can void a sale</RoleNote></span>)}
        </>}
      />

      {voided && (
        <Notice tone="danger" title="This sale was voided">
          {formatDateTime(sale.voided_at)}{sale.voided_by_name ? ` by ${sale.voided_by_name}` : ''}. Reason: {sale.void_reason || '—'}. The items went back into stock.
        </Notice>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Items</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr className="border-b">
                      <th scope="col" className="py-2 pr-3">Item</th>
                      <th scope="col" className="py-2 pr-3 text-right">Qty</th>
                      <th scope="col" className="py-2 pr-3 text-right">Price</th>
                      <th scope="col" className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sale.items.map((it) => (
                      <tr key={it.id} className="align-top">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">{it.product_name}</p>
                          <p className="text-xs text-slate-500">{it.variant_name} · <span className="font-mono">{it.sku}</span></p>
                          {it.units?.length > 0 && <p className="text-xs text-slate-600">S/N {it.units.map((u) => u.serial_number).join(', ')}</p>}
                        </td>
                        <td className="py-2.5 pr-3 text-right">{it.quantity}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                          {formatBDT(it.unit_price)}
                          {Number(it.unit_price) !== Number(it.list_price) && <span className="block text-xs text-amber-700">list {formatBDT(it.list_price)}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right font-medium">{formatBDT(it.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto mt-3 max-w-xs border-t pt-2">
                <InfoRow label="Subtotal">{formatBDT(sale.subtotal)}</InfoRow>
                {Number(sale.discount) > 0 && <InfoRow label={sale.coupon_code ? `Discount (${sale.coupon_code})` : 'Discount'}>−{formatBDT(sale.discount)}</InfoRow>}
                <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd>{formatBDT(sale.total_amount)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent>
              <dl>
                <InfoRow label="Payment">{PAYMENT_METHOD[sale.payment_method] || sale.payment_method} {voided ? <Badge tone="slate">Refunded</Badge> : <Badge tone="green">Paid</Badge>}</InfoRow>
                <InfoRow label="Sold by">{sale.operator_name || '—'}</InfoRow>
                <InfoRow label="Customer">{sale.customer_name || sale.customer_phone ? [sale.customer_name, sale.customer_phone && formatPhone(sale.customer_phone)].filter(Boolean).join(' · ') : 'Walk-in'}</InfoRow>
                {sale.note && <InfoRow label="Note">{sale.note}</InfoRow>}
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-lg border bg-white p-3 shadow-sm" aria-label="Receipt preview">
          <Receipt sale={sale} branch={branch} />
        </div>
      </div>

      {voiding && <VoidModal sale={sale} onClose={closeVoid} />}
      <PrintPortal page="receipt"><Receipt sale={sale} branch={branch} /></PrintPortal>
    </div>
  );
};

export default SaleDetailPage;
