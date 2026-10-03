import React, { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowLeft, Check, ClipboardCopy, Loader2, PackageCheck, Phone, Printer, RefreshCcw, RotateCcw,
  Truck, Undo2, Wallet, XCircle, CreditCard, Boxes,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/DataTable';
import { TextArea } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  InfoRow, Notice, OrderStatusBadge, PaymentStatusBadge, RoleNote,
} from '@/components/admin/ops/OpsUi';
import { PrintPortal } from '@/components/admin/ops/PrintPortal';
import { Invoice } from '@/components/admin/ops/Invoice';
import {
  CHANNEL, ORDER_STATUS, ORDER_TRANSITIONS, PAYMENT_METHOD, addressLines, copyText, formatPhone,
} from '@/components/admin/ops/labels';
import {
  useGetOrderQuery, useMarkOrderRefundedMutation, useReconcileOrderPaymentMutation,
  useUpdateOrderNoteMutation, useUpdateOrderStatusMutation,
} from '@/store/api/opsApi';
import { useGetBranchesAdminQuery } from '@/store/api/commonApi';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { formatBDT, formatDateTime } from '@/lib/format';
import { errorText } from '@/lib/apiError';
import OrderActionModal from './OrderActionModal';

const RECONCILE_OUTCOME = {
  success: { tone: 'info', text: 'SSLCommerz confirms the payment. The order is paid and confirmed.' },
  held: { tone: 'warn', text: 'SSLCommerz received the money but held it for a risk review. Check the merchant panel before approving.' },
  pending: { tone: 'warn', text: 'SSLCommerz has no final answer yet. Try again in a few minutes.' },
  paid_cancelled: { tone: 'danger', text: 'Money was received for an order that is no longer active — a refund is required.' },
  released: { tone: 'info', text: 'No payment was made. The order was cancelled and its stock released.' },
  unpaid: { tone: 'info', text: 'No completed payment found for this order (the customer may still be on the payment page).' },
  invalid: { tone: 'warn', text: 'Nothing usable came back from SSLCommerz.' },
};

// inside_chattogram → Inside Chattogram
const humanize = (s) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

/** The customer's own note, without the "Ship to:" line the API adds. */
const customerNote = (text) => (text || '').split('\n').filter((l) => !l.startsWith('Ship to:')).map((l) => l.replace(/^Note:\s*/, '')).join('\n').trim();

const OrderDetailPage = () => {
  const { id } = useParams();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const toast = useToast();
  const confirm = useConfirm();

  const { data: order, isLoading, error, refetch, isFetching } = useGetOrderQuery(id);
  const { data: branches = [] } = useGetBranchesAdminQuery();
  const [updateStatus, { isLoading: statusSaving }] = useUpdateOrderStatusMutation();
  const [markRefunded] = useMarkOrderRefundedMutation();
  const [reconcile, { isLoading: reconciling }] = useReconcileOrderPaymentMutation();

  const [action, setAction] = useState(null); // modal kind
  const [actionError, setActionError] = useState(null);
  const [gateway, setGateway] = useState(null); // last reconcile result
  const closeModal = useCallback(() => setAction(null), []);

  if (isLoading) {
    return <div className="flex justify-center py-24 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="space-y-4">
        <BackLink />
        <Notice tone={notFound ? 'warn' : 'danger'} title={notFound ? 'Order not found' : "Couldn't load this order"}>
          {notFound ? 'It may have been placed at another branch, or the link is wrong.' : errorText(error)}
          {!notFound && <div className="mt-2"><Button size="sm" variant="outline" onClick={refetch}>Try again</Button></div>}
        </Notice>
      </div>
    );
  }

  const branch = branches.find((b) => b.id === order.branch_id);
  const isPos = order.channel === 'pos';
  const isCod = order.payment_method === 'cod';
  const isOnlinePay = order.channel === 'online' && !isCod;
  const paidish = ['completed', 'processing'].includes(order.payment_status);
  const allowed = isPos ? [] : (ORDER_TRANSITIONS[order.status] || []);
  const lineBranches = new Set((order.items || []).map((i) => i.branch_id).filter(Boolean));
  // Branch staff may only change orders whose every item is from their branch (API: 403 otherwise).
  const readOnly = !isSuper && [...lineBranches].some((b) => b !== user?.branch_id);
  const phone = order.shipping_address?.phone || order.customer?.phone;
  const name = order.shipping_address?.full_name || order.customer?.full_name || order.customer_name;

  /** Run a status change; 403s (another branch's stock) are shown in the page, not just a toast. */
  const changeStatus = async (body, successText) => {
    setActionError(null);
    try {
      await updateStatus({ id: order.id, ...body }).unwrap();
      toast.success(successText);
      setAction(null);
    } catch (err) {
      const e = { status: err?.status, message: errorText(err) };
      if (err?.status === 403) setActionError(e.message);
      toast.error(e.message);
      throw e;
    }
  };
  const quiet = (p) => p.catch(() => {}); // errors already shown

  const onConfirm = async () => {
    if (isCod) {
      const ok = await confirm({
        title: 'Did you confirm with the customer by phone?',
        body: (
          <div className="space-y-2">
            <p>Call <b>{name}</b> on{' '}
              <a href={`tel:${phone}`} className="font-semibold text-primary underline">{formatPhone(phone)}</a>{' '}
              and check the items, the address and that they will pay <b>{formatBDT(order.total_amount)}</b> on delivery.</p>
            <p>Confirming takes the items out of stock.</p>
          </div>
        ),
        confirmLabel: 'Yes, customer confirmed',
      });
      if (ok) quiet(changeStatus({ status: 'confirmed', note: 'Confirmed with the customer by phone' }, 'Order confirmed'));
      return;
    }
    const ok = await confirm({
      title: 'Confirm this order?',
      body: 'The payment is complete. Confirming takes the items out of stock so you can start packing.',
      confirmLabel: 'Confirm order',
    });
    if (ok) quiet(changeStatus({ status: 'confirmed' }, 'Order confirmed'));
  };

  const onProcessing = async () => {
    const ok = await confirm({ title: 'Start processing?', body: 'Use this when you start packing the order.', confirmLabel: 'Start processing' });
    if (ok) quiet(changeStatus({ status: 'processing' }, 'Order moved to processing'));
  };

  const onDelivered = async () => {
    const collect = isCod && order.payment_status !== 'completed';
    const ok = await confirm({
      title: 'Mark as delivered?',
      body: collect
        ? <>The customer received the parcel and paid <b>{formatBDT(order.total_amount)}</b> cash to the courier. This records the cash payment.</>
        : 'The customer received the parcel.',
      confirmLabel: 'Mark delivered',
    });
    if (ok) quiet(changeStatus({ status: 'delivered' }, 'Order marked delivered'));
  };

  const onModalSubmit = async (payload) => {
    if (action === 'refund') {
      try {
        await markRefunded({ id: order.id, note: payload.note }).unwrap();
        toast.success('Refund recorded');
        setAction(null);
      } catch (err) {
        const e = { status: err?.status, message: errorText(err) };
        toast.error(e.message);
        throw e;
      }
      return;
    }
    const text = {
      shipped: 'Order marked shipped', cancel: 'Order cancelled', returned: 'Order marked returned', mark_paid: 'Payment recorded and order confirmed',
    }[action];
    await changeStatus(payload, text);
  };

  const onReconcile = async () => {
    setActionError(null);
    try {
      const res = await reconcile(order.id).unwrap();
      setGateway(res);
      toast.info(RECONCILE_OUTCOME[res.outcome]?.text || `Result: ${res.outcome}`);
    } catch (err) {
      if (err?.status === 403) setActionError(errorText(err));
      toast.error(errorText(err));
    }
  };

  const onCopyAddress = async () => {
    try {
      await copyText(addressLines(order.shipping_address).join('\n'));
      toast.success('Address copied — paste it into the courier booking');
    } catch {
      toast.error("Couldn't copy. Select the address and copy it by hand.");
    }
  };

  const busy = statusSaving || reconciling;

  // ─── Next-step buttons (allowed transitions only) ───
  const nextButtons = [];
  if (allowed.includes('confirmed')) {
    if (isOnlinePay && order.payment_status !== 'completed') {
      if (isSuper) {
        nextButtons.push(
          <Button key="paid" onClick={() => setAction('mark_paid')} disabled={busy}>
            <Wallet className="mr-2 h-4 w-4" />{order.payment_status === 'processing' ? 'Approve payment & confirm' : 'Mark as paid & confirm'}
          </Button>,
        );
      } else {
        nextButtons.push(
          <div key="paid" className="flex flex-col gap-1">
            <Button disabled><Check className="mr-2 h-4 w-4" />Confirm order</Button>
            <RoleNote>Waiting for online payment. Only a super admin can mark it paid.</RoleNote>
          </div>,
        );
      }
    } else {
      nextButtons.push(
        <Button key="confirm" onClick={onConfirm} disabled={busy}>
          {isCod ? <Phone className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}Confirm order
        </Button>,
      );
    }
  }
  if (allowed.includes('processing')) {
    nextButtons.push(<Button key="proc" onClick={onProcessing} disabled={busy}><Boxes className="mr-2 h-4 w-4" />Start processing</Button>);
  }
  if (allowed.includes('shipped')) {
    nextButtons.push(<Button key="ship" onClick={() => setAction('shipped')} disabled={busy}><Truck className="mr-2 h-4 w-4" />Mark shipped</Button>);
  }
  if (allowed.includes('delivered')) {
    nextButtons.push(<Button key="deliv" onClick={onDelivered} disabled={busy}><PackageCheck className="mr-2 h-4 w-4" />Mark delivered</Button>);
  }
  if (allowed.includes('returned')) {
    nextButtons.push(<Button key="ret" variant="outline" onClick={() => setAction('returned')} disabled={busy}><Undo2 className="mr-2 h-4 w-4" />Mark returned</Button>);
  }
  if (allowed.includes('cancelled')) {
    nextButtons.push(<Button key="cancel" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setAction('cancel')} disabled={busy}><XCircle className="mr-2 h-4 w-4" />Cancel order</Button>);
  }
  const canRefund = paidish && ['cancelled', 'returned'].includes(order.status) && !isPos;

  return (
    <div className="space-y-5">
      <BackLink />
      <PageHeader
        title={<span className="font-mono">{order.order_number}</span>}
        description={`${CHANNEL[order.channel] || order.channel} order · placed ${formatDateTime(order.created_at)}${order.branch_name ? ` · ${order.branch_name}` : ''}`}
        actions={<>
          <Button variant="outline" onClick={refetch} disabled={isFetching} aria-label="Reload order">
            <RefreshCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print invoice</Button>
        </>}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OrderStatusBadge status={order.status} />
        <span className="text-slate-400">·</span>
        <span className="text-slate-700">{PAYMENT_METHOD[order.payment_method] || order.payment_method}</span>
        <PaymentStatusBadge status={order.payment_status} />
      </div>

      {order.system_note && (
        <Notice tone="danger" title="Needs attention">
          <p className="whitespace-pre-wrap">{order.system_note}</p>
        </Notice>
      )}
      {isPos && (
        <Notice tone="info" title="In-store sale">
          This sale was rung up at the counter. <Link to={`/admin/pos/sales/${order.id}`} className="font-semibold underline">Open it in sales history</Link> to reprint the receipt or void it.
        </Notice>
      )}
      {readOnly && !isPos && (
        <Notice tone="warn" title="View only">
          This order includes stock from another branch — a super admin must handle it. You can still read it and add notes.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {!isPos && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Next step</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {actionError && <Notice tone="danger" title="Not allowed">{actionError}</Notice>}
                {allowed.length === 0 ? (
                  <p className="text-sm text-slate-600">This order is {ORDER_STATUS[order.status]?.label.toLowerCase() || order.status}. No further status changes are possible.</p>
                ) : readOnly ? (
                  <RoleNote>Status changes are disabled: this order includes stock from another branch.</RoleNote>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">{nextButtons}</div>
                )}
                {((isOnlinePay && isSuper) || canRefund) && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {isOnlinePay && isSuper && (
                      <Button variant="outline" size="sm" onClick={onReconcile} disabled={busy || readOnly}>
                        {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}Check payment with SSLCommerz
                      </Button>
                    )}
                    {canRefund && (isSuper ? (
                      <Button variant="outline" size="sm" onClick={() => setAction('refund')} disabled={busy}><RotateCcw className="mr-2 h-4 w-4" />Mark refunded</Button>
                    ) : <RoleNote>Only a super admin can record a refund.</RoleNote>)}
                  </div>
                )}
                {gateway && <GatewayResult result={gateway} />}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Items</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr className="border-b">
                      <th scope="col" className="py-2 pr-3">Item</th>
                      <th scope="col" className="py-2 pr-3">SKU</th>
                      {lineBranches.size > 1 && <th scope="col" className="py-2 pr-3">From</th>}
                      <th scope="col" className="py-2 pr-3 text-right">Qty</th>
                      <th scope="col" className="py-2 pr-3 text-right">Price</th>
                      <th scope="col" className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {order.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">{it.product_name}</p>
                          <p className="text-xs text-slate-500">{it.variant_name}</p>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">
                          {it.sku ? <Link to={`/admin/inventory?q=${encodeURIComponent(it.sku)}`} className="text-primary hover:underline" title="Show stock">{it.sku}</Link> : '—'}
                        </td>
                        {lineBranches.size > 1 && <td className="whitespace-nowrap py-2.5 pr-3 text-slate-600">{it.branch_name || '—'}</td>}
                        <td className="py-2.5 pr-3 text-right">{it.quantity}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                          {formatBDT(it.unit_price)}
                          {Number(it.list_price) > Number(it.unit_price) && <span className="block text-xs text-slate-400 line-through">{formatBDT(it.list_price)}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right font-medium">{formatBDT(it.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto mt-3 max-w-xs border-t pt-2">
                <InfoRow label="Subtotal">{formatBDT(order.subtotal)}</InfoRow>
                {Number(order.discount) > 0 && <InfoRow label={order.coupon_code ? `Discount (${order.coupon_code})` : 'Discount'}>−{formatBDT(order.discount)}</InfoRow>}
                {!isPos && <InfoRow label="Delivery">{formatBDT(order.shipping_fee)}</InfoRow>}
                <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd>{formatBDT(order.total_amount)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Payments</CardTitle></CardHeader>
            <CardContent>
              {order.transactions.length === 0 ? (
                <p className="text-sm text-slate-500">{isCod ? 'Cash is recorded when the order is marked delivered.' : 'No payment recorded yet.'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr className="border-b">
                        <th scope="col" className="py-2 pr-3">Date</th>
                        <th scope="col" className="py-2 pr-3">Method</th>
                        <th scope="col" className="py-2 pr-3">Status</th>
                        <th scope="col" className="py-2 pr-3 text-right">Amount</th>
                        <th scope="col" className="py-2">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {order.transactions.map((t) => (
                        <tr key={t.id} className="align-top">
                          <td className="whitespace-nowrap py-2.5 pr-3 text-slate-600">{formatDateTime(t.created_at)}</td>
                          <td className="py-2.5 pr-3">{PAYMENT_METHOD[t.payment_method] || t.payment_method}{t.ssl_card_type && <span className="block text-xs text-slate-500">{t.ssl_card_type}</span>}</td>
                          <td className="py-2.5 pr-3"><PaymentStatusBadge status={t.payment_status} />
                            {t.ssl_risk_title && t.ssl_risk_level !== '0' && <span className="mt-1 block text-xs text-amber-700">Risk: {t.ssl_risk_title}</span>}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">{formatBDT(t.amount)}</td>
                          <td className="py-2.5 text-xs text-slate-600">
                            {t.ssl_bank_tran_id && <span className="block font-mono">Bank: {t.ssl_bank_tran_id}</span>}
                            {t.ssl_validation_id && <span className="block font-mono">Val: {t.ssl_validation_id}</span>}
                            {t.note && <span className="block whitespace-pre-wrap">{t.note}</span>}
                            {!t.ssl_bank_tran_id && !t.ssl_validation_id && !t.note && '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {order.status_history.map((h, i) => (
                  <li key={`${h.created_at}-${i}`} className="relative">
                    <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-white" />
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={h.to_status} />
                      <span className="text-xs text-slate-500">{formatDateTime(h.created_at)}</span>
                      <span className="text-xs text-slate-500">· {h.actor_name ? `${h.actor_name}${h.actor_role === 'customer' ? ' (customer)' : ''}` : 'System'}</span>
                    </div>
                    {h.note && <p className="mt-1 text-sm text-slate-700">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{order.customer?.full_name || name || 'Walk-in customer'}</p>
                {order.customer?.phone && <a href={`tel:${order.customer.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{formatPhone(order.customer.phone)}</a>}
                {order.customer?.email && <p className="text-slate-600">{order.customer.email}</p>}
              </div>
              {order.shipping_address && (
                <div className="rounded-md border bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deliver to</span>
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={onCopyAddress}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />Copy
                    </Button>
                  </div>
                  {addressLines(order.shipping_address).map((l, i) => <p key={`${i}-${l}`} className="text-slate-800">{l}</p>)}
                </div>
              )}
              {customerNote(order.customer_note) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer&apos;s note</p>
                  <p className="whitespace-pre-wrap text-slate-800">{customerNote(order.customer_note)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Delivery</CardTitle></CardHeader>
            <CardContent>
              <dl>
                <InfoRow label="Area">{humanize(order.shipping_method)}</InfoRow>
                <InfoRow label="Courier">{order.courier || '—'}</InfoRow>
                <InfoRow label="Tracking no.">{order.tracking_number ? <span className="font-mono">{order.tracking_number}</span> : '—'}</InfoRow>
                {order.confirmed_at && <InfoRow label="Confirmed">{formatDateTime(order.confirmed_at)}</InfoRow>}
                {order.shipped_at && <InfoRow label="Shipped">{formatDateTime(order.shipped_at)}</InfoRow>}
                {order.delivered_at && <InfoRow label="Delivered">{formatDateTime(order.delivered_at)}</InfoRow>}
                {order.cancelled_at && <InfoRow label="Cancelled">{formatDateTime(order.cancelled_at)}</InfoRow>}
              </dl>
            </CardContent>
          </Card>

          {!isPos && <AdminNote key={order.id} order={order} />}
        </div>
      </div>

      {action && <OrderActionModal kind={action} order={order} onClose={closeModal} onSubmit={onModalSubmit} />}
      <PrintPortal page="a4"><Invoice order={order} branch={branch} /></PrintPortal>
    </div>
  );
};

const BackLink = () => (
  <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
    <ArrowLeft className="h-4 w-4" />All orders
  </Link>
);

const GatewayResult = ({ result }) => {
  const o = RECONCILE_OUTCOME[result.outcome] || { tone: 'info', text: result.outcome };
  return (
    <Notice tone={o.tone} title="SSLCommerz says">
      <p>{o.text}</p>
      {result.gateway?.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {result.gateway.map((g, i) => (
            <li key={g.val_id || i} className="font-mono">
              {g.status} · {g.amount} {g.currency} {g.card_type ? `· ${g.card_type}` : ''} {g.tran_date ? `· ${g.tran_date}` : ''}
            </li>
          ))}
        </ul>
      )}
      {result.gateway?.length === 0 && <p className="mt-1 text-xs">No payment attempts found at the gateway.</p>}
    </Notice>
  );
};

/** Staff-only free-text note. System flags are shown separately and can't be edited. */
const AdminNote = ({ order }) => {
  const toast = useToast();
  const [text, setText] = useState(order.admin_note || '');
  const [save, { isLoading }] = useUpdateOrderNoteMutation();
  const dirty = text.trim() !== (order.admin_note || '').trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!dirty || isLoading) return;
    try {
      await save({ id: order.id, admin_note: text.trim() || null }).unwrap();
      toast.success('Note saved');
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Staff note</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="order-admin-note" className="sr-only">Staff note</label>
          <TextArea id="order-admin-note" rows={4} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)}
            placeholder="Only staff see this. e.g. Customer asked for evening delivery." />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!dirty || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save note
            </Button>
            {dirty && <Button type="button" size="sm" variant="ghost" onClick={() => setText(order.admin_note || '')}>Discard</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default OrderDetailPage;
