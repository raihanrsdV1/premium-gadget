import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { DataTable, PageHeader } from '../../../components/admin/DataTable';
import { Modal } from '../../../components/admin/Modal';
import { Field, TextInput, TextArea, Checkbox } from '../../../components/admin/Field';
import { Button } from '../../../components/ui/Button';
import { CharCount, IconButton, Switch, Thumb, SrOnly } from '../../../components/admin/catalog/CatalogUi';
import { SingleImageField } from '../../../components/admin/catalog/SingleImageField';
import { SLUG_RE, slugify, str, textOrNull } from '../../../components/admin/catalog/catalogUtils';
import {
  useCreateBrandMutation, useDeleteBrandMutation, useGetBrandsAdminQuery, useUpdateBrandMutation,
} from '../../../store/api/catalogApi';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };
const friendly = (msg) => msg.replace(/\s*\(is_active: false\)/, '').replace('Deactivate it instead', 'Switch it off instead');
const EMPTY = [];

const formFrom = (b) => (b ? {
  name: b.name, slug: b.slug, slugTouched: true, logo_url: b.logo_url || '', description: b.description || '',
  meta_title: b.meta_title || '', meta_description: b.meta_description || '', sort_order: str(b.sort_order ?? 0), is_active: !!b.is_active,
} : {
  name: '', slug: '', slugTouched: false, logo_url: '', description: '', meta_title: '', meta_description: '', sort_order: '0', is_active: true,
});

const BrandModal = ({ editing, onClose }) => {
  const toast = useToast();
  const isNew = !editing;
  const [form, setForm] = useState(() => formFrom(editing));
  const [errors, setErrors] = useState({});
  const [create, { isLoading: creating }] = useCreateBrandMutation();
  const [update, { isLoading: updating }] = useUpdateBrandMutation();
  const saving = creating || updating;
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const slugShown = isNew && !form.slugTouched ? slugify(form.name) : form.slug;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Enter the brand name.';
    if (form.slug.trim() && (!isNew || form.slugTouched) && !SLUG_RE.test(form.slug.trim())) errs.slug = 'Lowercase letters, numbers and dashes only.';
    if (!/^-?\d+$/.test(String(form.sort_order).trim() || '0')) errs.sort_order = 'Whole numbers only.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: form.name.trim(),
      logo_url: form.logo_url || null,
      description: textOrNull(form.description),
      meta_title: textOrNull(form.meta_title),
      meta_description: textOrNull(form.meta_description),
      sort_order: Number(form.sort_order || 0),
      is_active: form.is_active,
    };
    if (form.slug.trim() && (!isNew || form.slugTouched)) body.slug = form.slug.trim();
    try {
      if (isNew) await create(body).unwrap();
      else await update({ id: editing.id, ...body }).unwrap();
      toast.success(isNew ? `${body.name} added.` : `${body.name} saved.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the brand.'));
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'Add brand' : `Edit ${editing.name}`}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="brand-form" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : isNew ? 'Add brand' : 'Save changes'}</Button>
      </>}>
      <form id="brand-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-5 md:grid-cols-[1fr_180px]">
          <div className="space-y-5">
            <Field label="Name" required error={errors.name}>
              {(id) => <TextInput id={id} value={form.name} maxLength={120} onKeyDown={noEnter}
                onChange={(e) => set(isNew && !form.slugTouched ? { name: e.target.value, slug: slugify(e.target.value) } : { name: e.target.value })} />}
            </Field>
            <Field label="Web address" error={errors.slug} hint={isNew ? 'Made from the name.' : 'Changing it breaks old links.'}>
              {(id) => (
                <div className="flex items-stretch overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
                  <span className="flex items-center border-r bg-slate-50 px-2.5 text-xs text-slate-500">?brand=</span>
                  <input id={id} value={slugShown} maxLength={140} onKeyDown={noEnter}
                    onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-'), slugTouched: true })}
                    className="h-10 min-w-0 flex-1 bg-white px-3 text-sm focus:outline-none" />
                </div>
              )}
            </Field>
          </div>
          <SingleImageField label="Logo" aspect="aspect-square" fit="object-contain p-2" value={form.logo_url || null}
            onChange={(url) => set({ logo_url: url || '' })} onError={(m) => toast.error(m)} hint="Square, transparent or white background." />
        </div>
        <Field label="Description">
          {(id) => <TextArea id={id} rows={3} value={form.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={<span className="flex justify-between gap-2">Title on Google <CharCount value={form.meta_title} max={60} /></span>} hint="Leave empty to use the brand name.">
            {(id) => <TextInput id={id} value={form.meta_title} maxLength={255} onKeyDown={noEnter} onChange={(e) => set({ meta_title: e.target.value })} />}
          </Field>
          <Field label={<span className="flex justify-between gap-2">Description on Google <CharCount value={form.meta_description} max={160} /></span>}>
            {(id) => <TextArea id={id} rows={2} value={form.meta_description} maxLength={500} onChange={(e) => set({ meta_description: e.target.value })} />}
          </Field>
          <Field label="Sort order" error={errors.sort_order} hint="Lower numbers show first.">
            {(id) => <TextInput id={id} type="number" step="1" value={form.sort_order} onKeyDown={noEnter} onChange={(e) => set({ sort_order: e.target.value })} />}
          </Field>
        </div>
        <Checkbox label="Show on website" hint="Hidden brands don't appear in the website's brand list or filters." checked={form.is_active} onChange={(v) => set({ is_active: v })} />
      </form>
    </Modal>
  );
};

const Brands = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = useSelector((s) => s.auth.user?.role) === 'super_admin';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const { data = EMPTY, isLoading, error, refetch } = useGetBrandsAdminQuery();
  const [modal, setModal] = useState(null); // { editing? }
  const [busy, setBusy] = useState(null);
  const [update] = useUpdateBrandMutation();
  const [remove] = useDeleteBrandMutation();

  // ~a few dozen brands: filtered in the browser.
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? data.filter((b) => b.name.toLowerCase().includes(t) || b.slug.includes(t)) : data;
  }, [data, q]);

  const patch = async (row, body, message) => {
    setBusy(row.id);
    try {
      await update({ id: row.id, ...body }).unwrap();
      toast.success(message);
    } catch (err) {
      toast.error(errorText(err, 'Could not update the brand.'));
    } finally {
      setBusy(null);
    }
  };

  const del = async (row) => {
    const ok = await confirm({
      title: `Delete “${row.name}”?`,
      body: 'This removes the brand for good. Only brands with no products can be deleted.',
      confirmLabel: 'Delete brand',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(row.id).unwrap();
      toast.success(`${row.name} deleted.`);
    } catch (err) {
      if (err?.status === 409) {
        const off = await confirm({
          title: `Can't delete “${row.name}”`,
          body: friendly(errorText(err)),
          confirmLabel: row.is_active ? 'Switch it off instead' : 'OK',
          cancelLabel: 'Close',
        });
        if (off && row.is_active) await patch(row, { is_active: false }, `${row.name} is now hidden from the website.`);
      } else {
        toast.error(errorText(err, 'Could not delete the brand.'));
      }
    }
  };

  const columns = [
    { key: 'logo', header: '', className: 'w-16', render: (r) => <Thumb src={r.logo_url} className="h-10 w-10" fit="object-contain p-1" /> },
    {
      key: 'name', header: 'Brand', render: (r) => (
        <div>
          <span className={`font-medium ${r.is_active ? 'text-slate-900' : 'text-slate-400'}`}>{r.name}</span>
          <span className="block font-mono text-xs text-slate-400">{r.slug}</span>
        </div>
      ),
    },
    {
      key: 'products', header: 'Products', render: (r) => (
        <span className="whitespace-nowrap text-sm"><span className="font-medium tabular-nums">{r.product_count ?? 0}</span><span className="text-slate-500"> on website</span>
          {r.total_product_count !== undefined && r.total_product_count !== r.product_count && <span className="block text-xs text-slate-400">{r.total_product_count} in total</span>}
        </span>
      ),
    },
    { key: 'sort', header: 'Sort', className: 'tabular-nums text-slate-600', render: (r) => r.sort_order },
    {
      key: 'active', header: 'On website', render: (r) => (
        <Switch checked={r.is_active} busy={busy === r.id} label={`Show ${r.name} on the website`}
          onChange={(v) => patch(r, { is_active: v }, `${r.name} is now ${v ? 'shown on' : 'hidden from'} the website.`)} />
      ),
    },
    {
      key: 'actions', header: <SrOnly>Actions</SrOnly>, render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Pencil} label={`Edit ${r.name}`} onClick={() => setModal({ editing: r })} />
          {isSuper && <IconButton icon={Trash2} tone="danger" label={`Delete ${r.name}`} onClick={() => del(r)} />}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Brands" description="Brands customers can browse and filter by."
        actions={<Button onClick={() => setModal({})}><Plus className="mr-2 h-4 w-4" />Add brand</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput type="search" value={q} placeholder="Search brands" aria-label="Search brands" className="pl-9"
          onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set('q', e.target.value); else n.delete('q'); return n; }, { replace: true })} />
      </div>
      <DataTable columns={columns} rows={rows} loading={isLoading} error={error ? errorText(error, 'Could not load brands.') : null} onRetry={refetch}
        onRowClick={(r) => setModal({ editing: r })} empty={q ? 'No brands match your search.' : 'No brands yet.'} />
      {modal && <BrandModal key={modal.editing?.id || 'new'} editing={modal.editing || null} onClose={() => setModal(null)} />}
    </div>
  );
};

export default Brands;
