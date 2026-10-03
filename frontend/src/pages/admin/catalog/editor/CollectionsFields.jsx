import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useGetCollectionsAdminQuery, useSetProductCollectionsMutation } from '../../../../store/api/catalogApi';
import { ToneChip } from '../../../../components/admin/catalog/CollectionUi';
import { useToast } from '../../../../hooks/useToast';
import { errorText } from '../../../../lib/apiError';
import { cn } from '@/lib/utils';

/** Chips for the hand-picked collections a product is in; a super admin toggles them (saves at once). */
export const CollectionsFields = ({ product, isSuper }) => {
  const toast = useToast();
  const { data: all = [], isLoading } = useGetCollectionsAdminQuery();
  const [save, { isLoading: saving }] = useSetProductCollectionsMutation();
  const manual = all.filter((c) => c.source === 'manual');
  const current = new Set((product.collections || []).map((c) => c.id));

  const toggle = async (c) => {
    const next = new Set(current);
    if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
    try {
      await save({ id: product.id, collection_ids: [...next] }).unwrap();
      toast.success(next.has(c.id) ? `Added to ${c.name}.` : `Removed from ${c.name}.`);
    } catch (err) {
      toast.error(errorText(err, 'Could not change the collections.'));
    }
  };

  return (
    <div className="space-y-3">
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : manual.length === 0 ? (
        <p className="text-sm text-slate-500">There are no hand-picked collections yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Collections">
          {manual.map((c) => {
            const on = current.has(c.id);
            return (
              <button key={c.id} type="button" disabled={!isSuper || saving} onClick={() => toggle(c)} aria-pressed={on}
                className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed',
                  on ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-600 enabled:hover:bg-slate-50')}>
                {on ? '✓ ' : ''}{c.name}
                {c.badge_label && <ToneChip label={c.badge_label} tone={c.badge_tone} />}
              </button>
            );
          })}
        </div>
      )}
      {!isSuper && <p className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Only a super admin can change collections.</p>}
      <p className="text-xs text-slate-500">
        Automatic collections (new arrivals, best sellers, deals…) fill themselves. <Link to="/admin/collections" className="font-medium text-primary underline">Manage collections</Link>
      </p>
    </div>
  );
};

export default CollectionsFields;
