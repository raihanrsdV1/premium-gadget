import React, { useState } from 'react';
import { ChevronDown, History, Loader2 } from 'lucide-react';
import { useGetPriceHistoryQuery } from '../../../../store/api/catalogApi';
import { errorText } from '../../../../lib/apiError';
import { formatBDT, formatDateTime } from '../../../../lib/format';
import { cn } from '@/lib/utils';

const FIELD = {
  price: 'Price', compare_at_price: 'Was price', cost_price: 'Cost', sale_price: 'Sale price',
  sale_starts_at: 'Sale starts', sale_ends_at: 'Sale ends',
};
const ROLE = { super_admin: 'Super admin', branch_admin: 'Branch staff' };

const show = (field, v) => {
  if (v === null || v === undefined || v === '') return 'none';
  if (field.endsWith('_at')) return formatDateTime(v);
  return formatBDT(v);
};

/** Who changed which price, and when (GET /products/admin/:id/price-history). */
export const PriceHistory = ({ productId }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useGetPriceHistoryQuery(productId, { skip: !open });
  const rows = data || [];

  return (
    <div className="rounded-lg border bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50">
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open ? '' : '-rotate-90')} />
        <History className="h-4 w-4 text-slate-500" />Price history
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}
          {error && <p className="text-sm text-red-600">{errorText(error)}</p>}
          {!isLoading && !error && rows.length === 0 && <p className="text-sm text-slate-500">No price changes recorded yet.</p>}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Price history">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="py-1.5 pr-4">When</th><th className="pr-4">Who</th><th className="pr-4">Variant</th><th>What changed</th></tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={`${r.at}-${r.variant_id}-${i}`} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(r.at)}</td>
                      <td className="py-2 pr-4">{r.actor ? <>{r.actor.full_name}<span className="block text-xs text-slate-500">{ROLE[r.actor.role] || r.actor.role}</span></> : <span className="text-slate-400">System</span>}</td>
                      <td className="py-2 pr-4">{r.variant_name}<span className="block font-mono text-xs text-slate-500">{r.sku}</span></td>
                      <td className="py-2">
                        {r.changes.map((c) => (
                          <div key={c.field}>{FIELD[c.field] || c.field}: <span className="text-slate-500">{show(c.field, c.from)}</span> → <span className="font-medium">{show(c.field, c.to)}</span></div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceHistory;
