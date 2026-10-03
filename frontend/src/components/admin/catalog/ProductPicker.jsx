import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Modal } from '../Modal';
import { TextInput } from '../Field';
import { Badge } from '../DataTable';
import { Thumb } from './CatalogUi';
import { conditionInfo } from './catalogUtils';
import { useDebounce } from '../../../hooks/useDebounce';
import { useGetAdminProductsQuery } from '../../../store/api/catalogApi';
import { errorText } from '../../../lib/apiError';
import { formatBDT } from '../../../lib/format';

/**
 * Modal that searches active products (GET /products/admin?status=active)
 * and returns the picked row: onPick({ id, name, slug, image, min_price, … }).
 */
export const ProductPicker = ({ open, onClose, onPick, title = 'Choose a product' }) => (
  <Modal open={open} onClose={onClose} title={title} description="Only products that are switched on (active) are listed." size="lg">
    {open && <ProductPickerPanel onPick={onPick} />}
  </Modal>
);

/** The search + list on its own, for use inside another dialog. */
export const ProductPickerPanel = ({ onPick }) => {
  const [q, setQ] = useState('');
  const term = useDebounce(q.trim(), 300);
  const { data, isFetching, error, refetch } = useGetAdminProductsQuery({ q: term, status: 'active', limit: 12, sort: 'updated' });
  const rows = data?.rows || [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" aria-label="Search products" className="pl-9" />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
        {isFetching && !rows.length && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
        {error && (
          <div className="py-8 text-center text-sm text-red-600">
            {errorText(error)} <button type="button" className="ml-2 font-medium text-primary underline" onClick={refetch}>Try again</button>
          </div>
        )}
        {!isFetching && !error && !rows.length && <p className="py-10 text-center text-sm text-slate-500">No active products match “{term}”.</p>}
        <ul className="divide-y">
          {rows.map((p) => {
            const cond = conditionInfo(p.condition);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <Thumb src={p.image} className="h-12 w-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">{[p.brand, p.category].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Badge tone={cond.tone}>{cond.label}</Badge>
                  <span className="w-28 text-right text-sm">
                    <span className="block font-semibold text-slate-900">{formatBDT(p.min_price)}</span>
                    <span className={`block text-xs ${p.available > 0 ? 'text-slate-500' : 'text-red-600'}`}>{p.available > 0 ? `${p.available} in stock` : 'Out of stock'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Out-of-stock products can be picked, but the website hides their slide until stock is back.</p>
    </div>
  );
};

export default ProductPicker;
