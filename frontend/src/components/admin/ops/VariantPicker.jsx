import React, { useId, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { TextInput } from '../Field';
import { Button } from '../../ui/Button';
import { useDebounce } from '../../../hooks/useDebounce';
import { usePosCatalogQuery } from '../../../store/api/opsApi';
import { formatBDT } from '../../../lib/format';
import { errorText } from '../../../lib/apiError';

/**
 * Find a product variant by name or SKU (GET /pos/catalog). Stock shown is
 * for `branchId`.
 *   <VariantPicker branchId={id} value={variant} onChange={setVariant} />
 * `value` is the catalog row ({ variant_id, product_name, variant_name, sku, … }) or null.
 */
export const VariantPicker = ({ branchId, value, onChange, label = 'Product', error, autoFocus }) => {
  const id = useId();
  const [text, setText] = useState('');
  const q = useDebounce(text.trim(), 300);
  const enabled = q.length >= 2 && !!branchId;
  const { data = [], isFetching, error: fetchError } = usePosCatalogQuery(
    { q, branch_id: branchId, limit: 15 },
    { skip: !enabled },
  );

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-slate-900">{value.product_name}</p>
            <p className="text-xs text-slate-600">{value.variant_name} · <span className="font-mono">{value.sku}</span></p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X className="mr-1 h-4 w-4" />Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput id={id} value={text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocus}
          placeholder={branchId ? 'Type a product name or SKU…' : 'Choose a branch first'} disabled={!branchId}
          autoComplete="off" className="pl-9"
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {fetchError && <p className="text-xs text-red-600">{errorText(fetchError)}</p>}
      {enabled && !isFetching && !fetchError && data.length === 0 && (
        <p className="text-xs text-muted-foreground">No product matches &ldquo;{q}&rdquo;.</p>
      )}
      {enabled && data.length > 0 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border bg-white" aria-label="Matching products">
          {data.map((v) => (
            <li key={v.variant_id}>
              <button type="button" onClick={() => onChange(v)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{v.product_name}</span>
                  <span className="block text-xs text-slate-600">{v.variant_name} · <span className="font-mono">{v.sku}</span>{!v.product_active && ' · hidden from website'}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-600">
                  <span className="block font-medium text-slate-900">{formatBDT(v.effective_price)}</span>
                  {v.quantity} in stock here
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VariantPicker;
