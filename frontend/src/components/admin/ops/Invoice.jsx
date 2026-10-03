import React from 'react';
import { formatBDT, formatDate, formatDateTime } from '../../../lib/format';
import { PAYMENT_METHOD, PAYMENT_STATUS, SHOP_PHONE, addressLines, formatPhone } from './labels';
import { BrandLogo } from '../BrandLogo';

/**
 * A4 invoice for an online order (shape of GET /orders/:id). Printed through
 * <PrintPortal page="a4">.
 */
export const Invoice = ({ order, branch }) => {
  if (!order) return null;
  const ship = addressLines(order.shipping_address);
  const paid = order.payment_status === 'completed';

  return (
    <div className="mx-auto max-w-[186mm] bg-white font-sans text-[12px] leading-relaxed text-black">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          <BrandLogo size="lg" />
          <p className="mt-2 font-semibold">{branch?.name || order.branch_name || 'Premium Gadget'}</p>
          {branch?.address && <p className="max-w-[80mm]">{branch.address}</p>}
          <p>Phone: {branch?.phone ? formatPhone(branch.phone) : SHOP_PHONE}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-wide">INVOICE</p>
          <p className="mt-2"><span className="text-slate-600">Order no.</span> <b>{order.order_number}</b></p>
          <p><span className="text-slate-600">Date</span> {formatDate(order.created_at)}</p>
          <p><span className="text-slate-600">Payment</span> {PAYMENT_METHOD[order.payment_method] || order.payment_method}
            {' · '}{PAYMENT_STATUS[order.payment_status]?.label || order.payment_status}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Deliver to</p>
          {ship.length ? ship.map((l, i) => <p key={`${i}-${l}`}>{l}</p>) : <p>{order.customer?.full_name || order.customer_name || '—'}</p>}
        </div>
        <div>
          {(order.courier || order.tracking_number) && (
            <>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Shipment</p>
              {order.courier && <p>Courier: {order.courier}</p>}
              {order.tracking_number && <p>Tracking no.: {order.tracking_number}</p>}
              {order.shipped_at && <p>Shipped: {formatDateTime(order.shipped_at)}</p>}
            </>
          )}
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">Item</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Unit price</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((it, i) => (
            <tr key={it.id} className="border-b border-slate-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <p className="font-medium">{it.product_name}</p>
                <p className="text-[11px] text-slate-700">{[it.variant_name, it.sku && `SKU ${it.sku}`].filter(Boolean).join(' · ')}</p>
              </td>
              <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
              <td className="py-1.5 pr-2 text-right">{formatBDT(it.unit_price)}</td>
              <td className="py-1.5 text-right">{formatBDT(it.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <dl className="w-[75mm] space-y-0.5">
          <Line label="Subtotal" value={formatBDT(order.subtotal)} />
          {Number(order.discount) > 0 && (
            <Line label={order.coupon_code ? `Discount (${order.coupon_code})` : 'Discount'} value={`−${formatBDT(order.discount)}`} />
          )}
          <Line label="Delivery charge" value={formatBDT(order.shipping_fee)} />
          <div className="flex justify-between border-t-2 border-black pt-1 text-[14px] font-bold">
            <dt>Total</dt><dd>{formatBDT(order.total_amount)}</dd>
          </div>
          <Line label={paid ? 'Paid' : 'Amount due'} value={paid ? formatBDT(order.total_amount) : (order.payment_method === 'cod' ? `${formatBDT(order.total_amount)} (cash on delivery)` : formatBDT(order.total_amount))} />
        </dl>
      </div>

      <footer className="mt-10 border-t border-slate-400 pt-3 text-center text-[11px]">
        <p className="font-semibold">Keep this invoice for warranty.</p>
        <p>Thank you for shopping with Premium Gadget · {SHOP_PHONE}</p>
      </footer>
    </div>
  );
};

const Line = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <dt>{label}</dt><dd className="text-right">{value}</dd>
  </div>
);

export default Invoice;
