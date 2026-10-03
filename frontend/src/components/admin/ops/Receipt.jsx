import React from 'react';
import { formatBDT, formatDateTime } from '../../../lib/format';
import { PAYMENT_METHOD, SHOP_PHONE, formatPhone } from './labels';

/**
 * 80 mm till receipt for a POS sale (shape of GET /pos/sales/:id).
 * Black on white only, sized for a 72 mm printable width. Used both as the
 * on-screen preview and inside <PrintPortal page="receipt">.
 */
export const Receipt = ({ sale, branch }) => {
  if (!sale) return null;
  const items = sale.items || [];
  const voided = !!sale.voided_at;

  return (
    <div className="mx-auto w-[72mm] bg-white px-1 py-2 font-sans text-[11.5px] leading-snug text-black">
      <div className="text-center">
        <img src="/brand/logo-mark.png" alt="Premium Gadget" className="mx-auto mb-1 h-12 w-12 grayscale" />
        <p className="text-[13px] font-bold">{sale.branch_name || branch?.name || 'Premium Gadget'}</p>
        {branch?.address && <p>{branch.address}</p>}
        <p>Phone: {branch?.phone ? formatPhone(branch.phone) : SHOP_PHONE}</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[12px] font-bold uppercase tracking-wide">{voided ? 'Void — sale cancelled' : 'Sales receipt'}</p>
      <div className="mt-1 space-y-0.5">
        <Row label="Sale no." value={sale.order_number} />
        <Row label="Date" value={formatDateTime(sale.created_at)} />
        {sale.operator_name && <Row label="Served by" value={sale.operator_name} />}
        {(sale.customer_name || sale.customer_phone) && (
          <Row label="Customer" value={[sale.customer_name, sale.customer_phone].filter(Boolean).join(' · ')} />
        )}
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.id}>
            <p className="font-semibold">{it.product_name}</p>
            <p className="text-[10.5px]">{[it.variant_name, it.sku].filter(Boolean).join(' · ')}</p>
            {it.units?.length > 0 && <p className="text-[10.5px]">S/N: {it.units.map((u) => u.serial_number).join(', ')}</p>}
            <div className="flex justify-between">
              <span>
                {it.quantity} × {formatBDT(it.unit_price)}
                {Number(it.unit_price) !== Number(it.list_price) && <span className="text-[10.5px]"> (was {formatBDT(it.list_price)})</span>}
              </span>
              <span className="font-semibold">{formatBDT(it.total_price)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-0.5">
        <Row label="Subtotal" value={formatBDT(sale.subtotal)} />
        {Number(sale.discount) > 0 && (
          <Row label={sale.coupon_code ? `Discount (${sale.coupon_code})` : 'Discount'} value={`−${formatBDT(sale.discount)}`} />
        )}
        <div className="flex justify-between pt-1 text-[14px] font-bold">
          <span>TOTAL</span><span>{formatBDT(sale.total_amount)}</span>
        </div>
        <Row label="Paid by" value={PAYMENT_METHOD[sale.payment_method] || sale.payment_method} />
      </div>

      {voided && (
        <p className="mt-2 border border-black p-1 text-center font-bold">VOIDED {formatDateTime(sale.voided_at)}{sale.void_reason ? ` — ${sale.void_reason}` : ''}</p>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center font-bold">Keep this receipt for warranty</p>
      <p className="mt-0.5 text-center text-[10.5px]">Thank you for shopping with Premium Gadget</p>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <span>{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

export default Receipt;
