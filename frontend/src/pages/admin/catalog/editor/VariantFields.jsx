import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Field, TextInput, MoneyInput, Checkbox } from '../../../../components/admin/Field';
import { AttributeChips } from '../../../../components/admin/catalog/CatalogUi';
import { formatBDT } from '../../../../lib/format';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

/** SKUs are assigned by the system (PG-10001, …); staff only see and copy them. */
const SkuDisplay = ({ sku, id }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sku);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the code is still selectable */ }
  };
  if (!sku) {
    return <p id={id} className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-slate-500">Assigned automatically when saved</p>;
  }
  return (
    <div className="flex h-10 items-center justify-between gap-2 rounded-md border bg-slate-50 pl-3 pr-1">
      <span id={id} className="select-all font-mono text-sm text-slate-900">{sku}</span>
      <button type="button" onClick={copy} aria-label={`Copy SKU ${sku}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-200">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
};

/**
 * Fields of one variant. All staff can edit every price field (each change
 * is recorded with their name); `stockBranches` adds starting-stock inputs (new variants only).
 */
export const VariantFields = ({ value: d, onChange, errors = {}, stockBranches, idPrefix }) => {
  const price = Number(d.price);
  const cost = Number(d.cost_price);
  const margin = d.cost_price !== '' && price > 0 ? price - cost : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Variant name" required className="md:col-span-2" error={errors.variant_name}>
          {(id) => <TextInput id={id} value={d.variant_name} onChange={(e) => onChange({ variant_name: e.target.value })} onKeyDown={noEnter}
            maxLength={255} placeholder="e.g. 16GB / 512GB / Space Grey" />}
        </Field>
        <Field label="SKU" hint="Stock code, set by the system. Type the number at the POS to find it.">
          {(id) => <SkuDisplay sku={d.sku} id={id} />}
        </Field>
        <Field label="Colour">
          {(id) => <TextInput id={id} value={d.color} onChange={(e) => onChange({ color: e.target.value })} onKeyDown={noEnter} maxLength={60} placeholder="Optional" />}
        </Field>
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">Options</span>
        <AttributeChips idPrefix={idPrefix} value={d.attributes} onChange={(attributes) => onChange({ attributes })} />
        <p className="text-xs text-muted-foreground">What makes this variant different, e.g. RAM 16 GB, Storage 512 GB SSD.</p>
      </div>

      <div className="rounded-lg border bg-slate-50/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800">Price</span>
          <span className="text-xs text-slate-500">Price changes are recorded with your name.</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Price (৳)" required error={errors.price}>
            {(id) => <MoneyInput id={id} value={d.price} onChange={(e) => onChange({ price: e.target.value })} onKeyDown={noEnter} step="0.01" />}
          </Field>
          <Field label="Was (৳)" error={errors.compare_at_price} hint="Optional. Shown crossed out.">
            {(id) => <MoneyInput id={id} value={d.compare_at_price} onChange={(e) => onChange({ compare_at_price: e.target.value })} onKeyDown={noEnter} step="0.01" />}
          </Field>
          <Field label="Cost (৳)" error={errors.cost_price}
              hint={margin !== null && Number.isFinite(margin) ? `Profit ${formatBDT(margin)} (${Math.round((margin / price) * 100)}%) · never shown to customers` : 'What the shop paid. Never shown to customers.'}>
              {(id) => <MoneyInput id={id} value={d.cost_price} onChange={(e) => onChange({ cost_price: e.target.value })} onKeyDown={noEnter} step="0.01" />}
          </Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Sale price (৳)" error={errors.sale_price} hint="Optional. Lower than the price.">
            {(id) => <MoneyInput id={id} value={d.sale_price} onChange={(e) => onChange({ sale_price: e.target.value })} onKeyDown={noEnter} step="0.01" />}
          </Field>
          <Field label="Sale starts" error={errors.sale_starts_at} hint="Dhaka time. Empty = now.">
            {(id) => <TextInput id={id} type="datetime-local" value={d.sale_starts_at} onChange={(e) => onChange({ sale_starts_at: e.target.value })} onKeyDown={noEnter} />}
          </Field>
          <Field label="Sale ends" error={errors.sale_ends_at} hint="Dhaka time. Empty = no end.">
            {(id) => <TextInput id={id} type="datetime-local" value={d.sale_ends_at} onChange={(e) => onChange({ sale_ends_at: e.target.value })} onKeyDown={noEnter} />}
          </Field>
        </div>
      </div>

      {stockBranches && (
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-slate-800">Starting stock</span>
          {stockBranches.length === 0 ? (
            <p className="text-sm text-slate-500">No branches to stock yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {stockBranches.map((b) => (
                <Field key={b.id} label={b.name} error={errors[`stock.${b.id}`]}>
                  {(id) => <TextInput id={id} type="number" min="0" step="1" inputMode="numeric" value={d.stock[b.id] ?? ''} placeholder="0"
                    onChange={(e) => onChange({ stock: { ...d.stock, [b.id]: e.target.value } })} onKeyDown={noEnter} />}
                </Field>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Units on the shelf right now. Later changes go through Inventory.</p>
        </div>
      )}

      <Checkbox label="Available to buy" hint="Switch off to stop selling this variant without deleting it." checked={d.is_active} onChange={(v) => onChange({ is_active: v })} />
    </div>
  );
};

export default VariantFields;
