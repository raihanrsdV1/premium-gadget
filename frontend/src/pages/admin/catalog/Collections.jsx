import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Loader2, Pencil, Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
import { DataTable, Badge, PageHeader } from '../../../components/admin/DataTable';
import { Modal } from '../../../components/admin/Modal';
import { Field, TextInput, TextArea, Select, Checkbox } from '../../../components/admin/Field';
import { Button } from '../../../components/ui/Button';
import { IconButton, LockHint, MoveButtons, Tabs, Thumb, CharCount } from '../../../components/admin/catalog/CatalogUi';
import { SingleImageField } from '../../../components/admin/catalog/SingleImageField';
import { ProductPicker } from '../../../components/admin/catalog/ProductPicker';
import { ToneChip } from '../../../components/admin/catalog/CollectionUi';
import {
  COLLECTION_STATUS, LAYOUTS, SOURCES, TONES, WINDOWED, sourceText,
} from '../../../components/admin/catalog/collectionConfig';
import { SLUG_RE, moveItem, slugify, textOrNull } from '../../../components/admin/catalog/catalogUtils';
import {
  useCreateCollectionMutation, useDeleteCollectionMutation, useGetCollectionAdminQuery, useGetCollectionsAdminQuery,
  useSetCollectionHomeOrderMutation, useSetCollectionProductsMutation, useUpdateCollectionMutation,
} from '../../../store/api/catalogApi';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';
import { formatBDT, formatDateTime, fromLocalInput, toLocalInput } from '../../../lib/format';

const noEnter = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); };

const formFrom = (c) => ({
  name: c?.name || '',
  slug: c?.slug || '',
  slugTouched: !!c,
  description: c?.description || '',
  badge_label: c?.badge_label || '',
  badge_tone: c?.badge_tone || 'coral',
  source: c?.source || 'manual',
  source_days: String(c?.source_days || 30),
  show_on_home: c ? !!c.show_on_home : false,
  home_limit: String(c?.home_limit || 10),
  home_layout: c?.home_layout || 'carousel',
  is_active: c ? !!c.is_active : true,
  starts_at: toLocalInput(c?.starts_at),
  ends_at: toLocalInput(c?.ends_at),
  banner_url: c?.banner_url || '',
  meta_title: c?.meta_title || '',
  meta_description: c?.meta_description || '',
});

const validate = (f) => {
  const e = {};
  if (!f.name.trim()) e.name = 'Give the collection a name.';
  if (f.slug.trim() && !SLUG_RE.test(f.slug.trim())) e.slug = 'Lower-case letters, numbers and dashes only.';
  if (f.badge_label.length > 24) e.badge_label = 'At most 24 characters.';
  if (WINDOWED.includes(f.source)) {
    const n = Number(f.source_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) e.source_days = 'A whole number of days, 1 to 365.';
  }
  const lim = Number(f.home_limit);
  if (!Number.isInteger(lim) || lim < 1 || lim > 24) e.home_limit = 'A number from 1 to 24.';
  if (f.starts_at && f.ends_at && f.ends_at <= f.starts_at) e.ends_at = 'The end must be after the start.';
  if (f.home_layout === 'countdown' && !f.ends_at) e.ends_at = 'A countdown needs an end time.';
  return e;
};

const toBody = (f) => ({
  name: f.name.trim(),
  ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
  description: textOrNull(f.description),
  badge_label: textOrNull(f.badge_label),
  badge_tone: f.badge_tone,
  source: f.source,
  source_days: WINDOWED.includes(f.source) ? Number(f.source_days) : null,
  show_on_home: f.show_on_home,
  home_limit: Number(f.home_limit),
  home_layout: f.home_layout,
  is_active: f.is_active,
  starts_at: fromLocalInput(f.starts_at),
  ends_at: fromLocalInput(f.ends_at),
  banner_url: f.banner_url || null,
  meta_title: textOrNull(f.meta_title),
  meta_description: textOrNull(f.meta_description),
});

// ─── Details form ──────────────────────────────────────────

const DetailsForm = ({ editing, canWrite, onSaved }) => {
  const toast = useToast();
  const [f, setF] = useState(() => formFrom(editing));
  const [errors, setErrors] = useState({});
  const [create, { isLoading: creating }] = useCreateCollectionMutation();
  const [update, { isLoading: updating }] = useUpdateCollectionMutation();
  const saving = creating || updating;
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const src = SOURCES.find((s) => s.value === f.source);

  const submit = async (e) => {
    e.preventDefault();
    if (!canWrite || saving) return;
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Check the fields marked in red.'); return; }
    try {
      const saved = editing ? await update({ id: editing.id, ...toBody(f) }).unwrap() : await create(toBody(f)).unwrap();
      toast.success(editing ? 'Collection saved.' : 'Collection created.');
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, 'Could not save the collection.'));
    }
  };

  const ro = !canWrite;
  return (
    <form id="collection-form" onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={ro} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            {(id) => <TextInput id={id} value={f.name} maxLength={80} onKeyDown={noEnter} placeholder="e.g. Eid Sale"
              onChange={(e) => set({ name: e.target.value, ...(f.slugTouched ? {} : { slug: slugify(e.target.value) }) })} />}
          </Field>
          <Field label="Web address" error={errors.slug} hint={`Shown as /collections/${f.slug || '…'}`}>
            {(id) => <TextInput id={id} value={f.slug} maxLength={100} onKeyDown={noEnter} className="font-mono"
              onChange={(e) => set({ slug: e.target.value, slugTouched: true })} />}
          </Field>
        </div>
        <Field label="Description" hint="Shown at the top of the collection page.">
          {(id) => <TextArea id={id} rows={2} value={f.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />}
        </Field>

        <div className="grid gap-4 rounded-lg border bg-slate-50/70 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Badge on product cards" error={errors.badge_label} hint="Optional, e.g. Hot, New.">
            {(id) => <TextInput id={id} value={f.badge_label} maxLength={24} onKeyDown={noEnter} onChange={(e) => set({ badge_label: e.target.value })} />}
          </Field>
          <Field label="Badge colour">
            {(id) => <Select id={id} value={f.badge_tone} onChange={(e) => set({ badge_tone: e.target.value })}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>}
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700">Preview</span>
            <div className="flex h-10 items-center"><ToneChip label={f.badge_label.trim()} tone={f.badge_tone} /></div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Which products" hint={src?.help}>
            {(id) => <Select id={id} value={f.source} onChange={(e) => set({ source: e.target.value })}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>}
          </Field>
          {WINDOWED.includes(f.source) && (
            <Field label="Look back (days)" error={errors.source_days} hint="How far back to look.">
              {(id) => <TextInput id={id} type="number" min="1" max="365" value={f.source_days} onKeyDown={noEnter} onChange={(e) => set({ source_days: e.target.value })} />}
            </Field>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <Checkbox label="Show on the homepage" hint="Collections without any products are not shown." checked={f.show_on_home} onChange={(v) => set({ show_on_home: v })} disabled={ro} />
          {f.show_on_home && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Products on the homepage" error={errors.home_limit} hint="1 to 24.">
                {(id) => <TextInput id={id} type="number" min="1" max="24" value={f.home_limit} onKeyDown={noEnter} onChange={(e) => set({ home_limit: e.target.value })} />}
              </Field>
              <Field label="Layout">
                {(id) => <Select id={id} value={f.home_layout} onChange={(e) => set({ home_layout: e.target.value })}>
                  {LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>}
              </Field>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" hint="Dhaka time. Empty = right away.">
            {(id) => <TextInput id={id} type="datetime-local" value={f.starts_at} onKeyDown={noEnter} onChange={(e) => set({ starts_at: e.target.value })} />}
          </Field>
          <Field label="Ends" error={errors.ends_at} hint="Dhaka time. Empty = never.">
            {(id) => <TextInput id={id} type="datetime-local" value={f.ends_at} onKeyDown={noEnter} onChange={(e) => set({ ends_at: e.target.value })} />}
          </Field>
        </div>
        <Checkbox label="Switched on" hint="Switch off to hide the collection without deleting it." checked={f.is_active} onChange={(v) => set({ is_active: v })} disabled={ro} />

        <SingleImageField label="Banner image" aspect="aspect-[16/5]" value={f.banner_url || null} disabled={ro}
          onChange={(url) => set({ banner_url: url || '' })} onError={(m) => toast.error(m)} hint="Optional. Shown on the collection page, wide (about 1600 × 500)." />

        <div className="grid gap-4">
          <Field label="Google title" hint={<CharCount value={f.meta_title} max={120} />}>
            {(id) => <TextInput id={id} value={f.meta_title} maxLength={120} onKeyDown={noEnter} onChange={(e) => set({ meta_title: e.target.value })} />}
          </Field>
          <Field label="Google description" hint={<CharCount value={f.meta_description} max={320} />}>
            {(id) => <TextArea id={id} rows={2} value={f.meta_description} maxLength={320} onChange={(e) => set({ meta_description: e.target.value })} />}
          </Field>
        </div>
      </fieldset>
      {canWrite && (
        <div className="flex gap-2 border-t pt-4">
          <Button type="submit" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : editing ? 'Save changes' : 'Create collection'}</Button>
        </div>
      )}
    </form>
  );
};

// ─── Products panel ────────────────────────────────────────

const ProductsPanel = ({ collection, canWrite }) => {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useGetCollectionAdminQuery(collection.id);
  const [save, { isLoading: saving }] = useSetCollectionProductsMutation();
  const [draft, setDraft] = useState(null); // null = untouched
  const [picking, setPicking] = useState(false);

  const manual = collection.source === 'manual';
  const server = data?.products || [];
  const rows = draft ?? server;
  const dirty = draft !== null && JSON.stringify(draft.map((p) => p.id)) !== JSON.stringify(server.map((p) => p.id));

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (error) return <p className="py-8 text-center text-sm text-red-600">{errorText(error)} <button type="button" className="ml-2 underline" onClick={refetch}>Try again</button></p>;

  const onSave = async () => {
    try {
      await save({ id: collection.id, product_ids: rows.map((p) => p.id) }).unwrap();
      setDraft(null);
      toast.success('Products saved.');
    } catch (err) {
      toast.error(errorText(err, 'Could not save the products.'));
    }
  };
  const add = (p) => {
    setPicking(false);
    if (rows.some((r) => r.id === p.id)) { toast.info(`"${p.name}" is already in this collection.`); return; }
    setDraft([...rows, { id: p.id, name: p.name, slug: p.slug, image: p.image, min_price: p.min_price, is_active: true }]);
  };

  return (
    <div className="space-y-3">
      {manual ? (
        canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setPicking(true)} disabled={rows.length >= 200}><Plus className="mr-2 h-4 w-4" />Add a product</Button>
            <span className="text-xs text-slate-500">{rows.length} product{rows.length === 1 ? '' : 's'} · order here is the order on the website</span>
          </div>
        )
      ) : (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">This list fills itself automatically ({sourceText(collection)}). It is shown here for reference.</p>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-500">{manual ? 'No products yet. Add some above.' : 'No products match right now.'}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-6 text-center text-xs tabular-nums text-slate-400">{i + 1}</span>
              <Thumb src={p.image} className="h-10 w-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                {p.is_active === false && <span className="text-xs text-amber-700">Switched off, hidden on the website</span>}
              </span>
              <span className="text-sm font-medium text-slate-700">{p.min_price != null ? formatBDT(p.min_price) : ''}</span>
              {manual && canWrite && (
                <>
                  <MoveButtons index={i} count={rows.length} label={p.name} onMove={(a, b) => setDraft(moveItem(rows, a, b))} />
                  <IconButton label={`Remove ${p.name}`} icon={Trash2} tone="danger" onClick={() => setDraft(rows.filter((r) => r.id !== p.id))} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {manual && canWrite && (
        <div className="flex gap-2 border-t pt-3">
          <Button type="button" onClick={onSave} disabled={!dirty || saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save products'}</Button>
          {dirty && !saving && <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Discard changes</Button>}
        </div>
      )}
      <ProductPicker open={picking} onClose={() => setPicking(false)} onPick={add} title="Add a product" />
    </div>
  );
};

// ─── Modal ─────────────────────────────────────────────────

const CollectionModal = ({ editing: initial, canWrite, onClose }) => {
  const [created, setCreated] = useState(initial);
  const { data: list } = useGetCollectionsAdminQuery();
  // Always the freshest row (counts and names change while the dialog is open).
  const editing = created ? (list || []).find((c) => c.id === created.id) || created : null;
  const setEditing = setCreated;
  const [tab, setTab] = useState('details');
  const title = editing ? editing.name : 'New collection';

  return (
    <Modal open onClose={onClose} size="xl" title={title}
      description={canWrite ? undefined : 'You can look but not change. Only a super admin edits collections.'}>
      {editing && (
        <Tabs label="Collection" value={tab} onChange={setTab}
          tabs={[{ value: 'details', label: 'Details' }, { value: 'products', label: 'Products', count: editing.product_count }]} />
      )}
      {tab === 'details' || !editing ? (
        <DetailsForm key={editing?.id || 'new'} editing={editing} canWrite={canWrite}
          onSaved={(saved) => {
            if (!editing && saved?.id) { setEditing(saved); if (saved.source === 'manual') setTab('products'); else onClose(); } else onClose();
          }} />
      ) : (
        <ProductsPanel key={editing.id} collection={editing} canWrite={canWrite} />
      )}
    </Modal>
  );
};

// ─── Page ──────────────────────────────────────────────────

const Collections = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const canWrite = useSelector((s) => s.auth.user?.role) === 'super_admin';
  const { data, isLoading, error, refetch } = useGetCollectionsAdminQuery();
  const [setOrder, { isLoading: ordering }] = useSetCollectionHomeOrderMutation();
  const [remove, { isLoading: deleting }] = useDeleteCollectionMutation();
  const [modal, setModal] = useState(null); // { editing } | null

  const all = data || [];
  const home = all.filter((c) => c.show_on_home).sort((a, b) => a.home_sort_order - b.home_sort_order);
  const homePos = (c) => home.findIndex((h) => h.id === c.id) + 1;

  const move = async (c, dir) => {
    const i = home.findIndex((h) => h.id === c.id);
    const next = moveItem(home, i, i + dir);
    if (next === home) return;
    // Collections not on the homepage keep their relative place after those on it.
    const ids = [...next, ...all.filter((x) => !x.show_on_home)].map((x) => x.id);
    try { await setOrder(ids).unwrap(); toast.success('Homepage order saved.'); }
    catch (err) { toast.error(errorText(err, 'Could not change the order.')); }
  };

  const del = async (c) => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      body: 'It disappears from the website. The products themselves are not deleted. This cannot be undone.',
      confirmLabel: 'Delete collection', danger: true,
    });
    if (!ok) return;
    try { await remove(c.id).unwrap(); toast.success(`${c.name} deleted.`); }
    catch (err) { toast.error(errorText(err, 'Could not delete the collection.')); }
  };

  const columns = [
    { key: 'name', header: 'Collection', render: (c) => (
      <div><p className="font-medium text-slate-900">{c.name}</p><p className="font-mono text-xs text-slate-500">/{c.slug}</p></div>
    ) },
    { key: 'badge', header: 'Badge', render: (c) => <ToneChip label={c.badge_label} tone={c.badge_tone} /> },
    { key: 'source', header: 'Products come from', render: (c) => <span className="text-slate-700">{sourceText(c)}</span> },
    { key: 'status', header: 'Status', render: (c) => {
      const s = COLLECTION_STATUS[c.status] || COLLECTION_STATUS.off;
      return (<div><Badge tone={s.tone}>{s.label}</Badge>
        {(c.starts_at || c.ends_at) && <p className="mt-1 text-xs text-slate-500">{c.starts_at ? formatDateTime(c.starts_at) : 'now'} → {c.ends_at ? formatDateTime(c.ends_at) : 'no end'}</p>}</div>);
    } },
    { key: 'count', header: 'Products', className: 'tabular-nums', render: (c) => c.product_count },
    { key: 'home', header: 'On homepage', render: (c) => (c.show_on_home ? (
      <div className="flex items-center gap-2">
        <Badge tone="blue">Position {homePos(c)}</Badge>
        {canWrite && <MoveButtons index={homePos(c) - 1} count={home.length} label={c.name} disabled={ordering} onMove={(a, b) => move(c, b - a)} />}
      </div>
    ) : <span className="text-slate-400">No</span>) },
    { key: 'actions', header: '', className: 'text-right', render: (c) => (
      <div className="flex justify-end gap-1">
        <IconButton label={canWrite ? `Edit ${c.name}` : `View ${c.name}`} icon={canWrite ? Pencil : Package} onClick={() => setModal({ editing: c })} />
        {canWrite && <IconButton label={`Delete ${c.name}`} icon={Trash2} tone="danger" disabled={deleting} onClick={() => del(c)} />}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Collections" description="Groups of products such as “Hot Sale” or “New Arrivals”, shown on the homepage and as badges on product cards."
        actions={canWrite ? <Button onClick={() => setModal({ editing: null })}><Plus className="mr-2 h-4 w-4" />New collection</Button> : <LockHint>Only a super admin can change collections.</LockHint>} />
      <DataTable columns={columns} rows={all} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch}
        empty="No collections yet." />
      {!isLoading && !error && home.length > 1 && canWrite && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><AlertTriangle className="h-3.5 w-3.5" />Use the arrows to set the order of collections on the homepage.</p>
      )}
      {modal && <CollectionModal editing={modal.editing} canWrite={canWrite} onClose={() => setModal(null)} />}
    </div>
  );
};

export default Collections;
