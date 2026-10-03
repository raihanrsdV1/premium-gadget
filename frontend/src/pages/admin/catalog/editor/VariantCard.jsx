import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, Trash2 } from 'lucide-react';
import { Badge } from '../../../../components/admin/DataTable';
import { Button } from '../../../../components/ui/Button';
import { SaveRow, UnsavedPill } from '../../../../components/admin/catalog/CatalogUi';
import { useUpdateVariantMutation, useDeleteVariantMutation } from '../../../../store/api/catalogApi';
import { useToast } from '../../../../hooks/useToast';
import { useConfirm } from '../../../../hooks/useConfirm';
import { errorText } from '../../../../lib/apiError';
import { formatBDT } from '../../../../lib/format';
import { VariantFields } from './VariantFields';
import { validateVariant, variantFrom, variantUpdatePayload } from './productModel';
import { cn } from '@/lib/utils';

/** Read-only stock per branch, with a link to change it in Inventory. */
const StockTable = ({ variant, branches }) => {
  const rows = branches.map((b) => {
    const inv = variant.inventory?.find((i) => i.branch_id === b.id);
    return { id: b.id, name: b.name, quantity: inv?.quantity ?? 0, reserved: inv?.reserved ?? 0, available: inv?.available ?? 0 };
  });
  // Branches that were closed but still hold stock rows.
  (variant.inventory || []).forEach((i) => {
    if (!rows.some((r) => r.id === i.branch_id)) rows.push({ id: i.branch_id, name: i.branch_name, quantity: i.quantity, reserved: i.reserved, available: i.available });
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">Stock</span>
        <Link to={`/admin/inventory?q=${encodeURIComponent(variant.sku)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Change stock in Inventory <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th scope="col" className="px-3 py-2">Branch</th><th scope="col" className="px-3 py-2 text-right">In stock</th><th scope="col" className="px-3 py-2 text-right">Held for orders</th><th scope="col" className="px-3 py-2 text-right">Can sell</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.reserved}</td>
                <td className={cn('px-3 py-2 text-right font-medium tabular-nums', r.available > 0 ? 'text-slate-900' : 'text-red-600')}>{r.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * One existing variant: its own form (PUT /products/variants/:id with only
 * the changed fields), read-only stock, and delete for super admins. The
 * draft lives in the parent so the page knows about unsaved changes.
 */
export const VariantCard = ({ variant, productId, draft, setDraft, isSuper, branches, defaultOpen }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(defaultOpen);
  const [showErrors, setShowErrors] = useState(false);
  const [update, { isLoading: saving }] = useUpdateVariantMutation();
  const [remove, { isLoading: deleting }] = useDeleteVariantMutation();

  const base = variantFrom(variant);
  const value = draft ?? base;
  const changes = draft ? variantUpdatePayload(draft, base) : {};
  const dirty = Object.keys(changes).length > 0;
  const errors = validateVariant(value, { requireStockInts: false });
  const shownErrors = showErrors ? errors : {};
  const formId = `variant-${variant.id}`;

  const submit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) { setShowErrors(true); toast.error('Check the highlighted fields.'); return; }
    if (!dirty) return;
    try {
      await update({ id: variant.id, productId, ...changes }).unwrap();
      setDraft(null);
      setShowErrors(false);
      toast.success(`${value.variant_name} saved.`);
    } catch (err) {
      toast.error(errorText(err, 'Could not save the variant.'));
    }
  };

  const del = async () => {
    const ok = await confirm({
      title: `Delete “${variant.variant_name}”?`,
      body: 'If it has stock or appears on past orders it is switched off instead, so your records stay complete. Otherwise it is removed for good.',
      confirmLabel: 'Delete variant',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await remove({ id: variant.id, productId }).unwrap();
      setDraft(null);
      if (res.deleted) toast.success(`${variant.variant_name} deleted.`);
      else {
        const why = res.reason === 'referenced_by_orders' ? 'it appears on past orders' : 'it still has stock';
        toast.info(`${variant.variant_name} was switched off instead of deleted, because ${why}.`);
      }
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the variant.'));
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className={cn('rounded-lg border bg-white', dirty && 'border-amber-300')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${formId}-body`}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open ? '' : '-rotate-90')} />
        <span className="font-medium text-slate-900">{variant.variant_name}</span>
        <span className="font-mono text-xs text-slate-500">{variant.sku}</span>
        {!variant.is_active && <Badge tone="slate">Off</Badge>}
        {variant.is_on_sale && <Badge tone="red">On sale</Badge>}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <UnsavedPill show={dirty} />
          <span className="font-semibold text-slate-900">{formatBDT(variant.effective_price ?? variant.price)}</span>
          <span className={variant.available > 0 ? 'text-slate-500' : 'text-red-600'}>{variant.available} can sell</span>
        </span>
      </button>

      {open && (
        <div id={`${formId}-body`} className="space-y-5 border-t px-4 py-4">
          <VariantFields idPrefix={formId} value={value} errors={shownErrors}
            onChange={(patch) => setDraft({ ...value, ...patch })} />
          <StockTable variant={variant} branches={branches} />
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <SaveRow dirty={dirty} saving={saving} label="Save variant" onDiscard={() => { setDraft(null); setShowErrors(false); }} />
            <span className="flex-1" />
            {isSuper && (
              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" disabled={deleting} onClick={del}>
                <Trash2 className="mr-1.5 h-4 w-4" />Delete variant
              </Button>
            )}
          </div>
        </div>
      )}
    </form>
  );
};

export default VariantCard;
