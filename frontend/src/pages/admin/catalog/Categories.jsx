import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ClipboardList, FolderPlus, Info, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, Badge, PageHeader } from '../../../components/admin/DataTable';
import { Modal } from '../../../components/admin/Modal';
import { Field, TextInput, TextArea, Select, Checkbox } from '../../../components/admin/Field';
import { Button } from '../../../components/ui/Button';
import { CharCount, IconButton, Switch, SrOnly } from '../../../components/admin/catalog/CatalogUi';
import { SingleImageField } from '../../../components/admin/catalog/SingleImageField';
import { SpecTemplateEditor } from '../../../components/admin/catalog/SpecTemplateEditor';
import { useCategoryList } from '../../../components/admin/catalog/useCategoryList';
import { SLUG_RE, descendantIds, slugify, str, templateFields, textOrNull } from '../../../components/admin/catalog/catalogUtils';
import { useCreateCategoryMutation, useDeleteCategoryMutation, useUpdateCategoryMutation } from '../../../store/api/catalogApi';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

/** The API suggests "Deactivate it instead (is_active: false)"; say it in shop words. */
const friendly = (msg) => msg.replace(/\s*\(is_active: false\)/, '').replace('Deactivate it instead', 'Switch it off instead');

// ─── Create / edit modal ───────────────────────────────────

const emptyForm = (parentId = '') => ({
  name: '', slug: '', slugTouched: false, parent_id: parentId, description: '', banner_url: '',
  meta_title: '', meta_description: '', sort_order: '0', is_active: true,
});
const formFrom = (c) => ({
  name: c.name, slug: c.slug, slugTouched: true, parent_id: c.parent_id || '', description: c.description || '',
  banner_url: c.banner_url || '', meta_title: c.meta_title || '', meta_description: c.meta_description || '',
  sort_order: str(c.sort_order ?? 0), is_active: !!c.is_active,
});

const CategoryModal = ({ open, editing, parentId, rows, flat, onClose }) => {
  const toast = useToast();
  const [form, setForm] = useState(() => (editing ? formFrom(editing) : emptyForm(parentId)));
  const [errors, setErrors] = useState({});
  const [create, { isLoading: creating }] = useCreateCategoryMutation();
  const [update, { isLoading: updating }] = useUpdateCategoryMutation();
  const saving = creating || updating;
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const isNew = !editing;
  const slugShown = isNew && !form.slugTouched ? slugify(form.name) : form.slug;
  const blocked = editing ? descendantIds(rows, editing.id) : new Set();

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Enter a name (at least 2 characters).';
    if (form.slug.trim() && (isNew ? form.slugTouched : true) && !SLUG_RE.test(form.slug.trim())) errs.slug = 'Lowercase letters, numbers and dashes only.';
    if (!/^-?\d+$/.test(String(form.sort_order).trim() || '0')) errs.sort_order = 'Whole numbers only.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      description: textOrNull(form.description),
      banner_url: form.banner_url || null,
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
      toast.error(errorText(err, 'Could not save the category.'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? 'Add category' : `Edit ${editing.name}`}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" form="category-form" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : isNew ? 'Add category' : 'Save changes'}</Button>
      </>}>
      <form id="category-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            {(id) => <TextInput id={id} value={form.name} maxLength={120} onKeyDown={noEnter}
              onChange={(e) => set(isNew && !form.slugTouched ? { name: e.target.value, slug: slugify(e.target.value) } : { name: e.target.value })} />}
          </Field>
          <Field label="Web address" error={errors.slug} hint={isNew ? 'Made from the name.' : 'Changing it breaks old links.'}>
            {(id) => (
              <div className="flex items-stretch overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center border-r bg-slate-50 px-2.5 text-xs text-slate-500">?category=</span>
                <input id={id} value={slugShown} maxLength={140} onKeyDown={noEnter}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-'), slugTouched: true })}
                  className="h-10 min-w-0 flex-1 bg-white px-3 text-sm focus:outline-none" />
              </div>
            )}
          </Field>
          <Field label="Parent category" hint="Leave empty for a main category.">
            {(id) => (
              <Select id={id} value={form.parent_id} onChange={(e) => set({ parent_id: e.target.value })}>
                <option value="">— None (main category) —</option>
                {flat.filter((c) => !blocked.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Sort order" error={errors.sort_order} hint="Lower numbers show first.">
            {(id) => <TextInput id={id} type="number" step="1" value={form.sort_order} onKeyDown={noEnter} onChange={(e) => set({ sort_order: e.target.value })} />}
          </Field>
        </div>
        <Field label="Description" hint="Shown at the top of the category page on the website.">
          {(id) => <TextArea id={id} rows={3} value={form.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <SingleImageField label="Banner image" hint="Wide image for the top of the category page (about 1600 × 400)." aspect="aspect-[4/1]"
          value={form.banner_url || null} onChange={(url) => set({ banner_url: url || '' })} onError={(m) => toast.error(m)} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={<span className="flex justify-between gap-2">Title on Google <CharCount value={form.meta_title} max={60} /></span>} hint="Leave empty to use the category name.">
            {(id) => <TextInput id={id} value={form.meta_title} maxLength={255} onKeyDown={noEnter} onChange={(e) => set({ meta_title: e.target.value })} />}
          </Field>
          <Field label={<span className="flex justify-between gap-2">Description on Google <CharCount value={form.meta_description} max={160} /></span>}>
            {(id) => <TextArea id={id} rows={2} value={form.meta_description} maxLength={500} onChange={(e) => set({ meta_description: e.target.value })} />}
          </Field>
        </div>
        <Checkbox label="Show on website" hint="Hidden categories don't appear in the website's menus or filters." checked={form.is_active} onChange={(v) => set({ is_active: v })} />
      </form>
    </Modal>
  );
};

// ─── Inline sort order ─────────────────────────────────────

const SortInput = ({ row, onSave }) => {
  const [v, setV] = useState(null);
  const shown = v ?? String(row.sort_order ?? 0);
  const commit = () => {
    if (v === null) return;
    const n = Number(v);
    setV(null);
    if (/^-?\d+$/.test(v.trim()) && n !== row.sort_order) onSave(n);
  };
  return (
    <input type="number" step="1" value={shown} aria-label={`Sort order of ${row.name}`}
      onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') setV(null); }}
      className="h-8 w-16 rounded-md border border-input bg-white px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  );
};

// ─── Page ──────────────────────────────────────────────────

const Categories = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = useSelector((s) => s.auth.user?.role) === 'super_admin';
  const [params, setParams] = useSearchParams();
  const { rows, flat, isLoading, error, refetch } = useCategoryList();
  const [modal, setModal] = useState(null); // { editing?, parentId? }
  const [busy, setBusy] = useState(null);
  const [update] = useUpdateCategoryMutation();
  const [remove] = useDeleteCategoryMutation();
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const templateId = params.get('template');
  const templateCategory = templateId ? byId.get(templateId) : null;
  const openTemplate = (id) => setParams((p) => { const n = new URLSearchParams(p); n.set('template', id); return n; });
  const closeTemplate = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('template'); return n; });

  const templateInfo = (row) => {
    if (row.spec_template?.groups) return { own: true, count: templateFields(row.spec_template).length };
    let cur = row.parent_id ? byId.get(row.parent_id) : null;
    for (let i = 0; cur && i < 32; i += 1) {
      if (cur.spec_template?.groups) return { from: cur.name };
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return null;
  };

  const patch = async (row, body, message) => {
    setBusy(row.id);
    try {
      await update({ id: row.id, ...body }).unwrap();
      toast.success(message);
    } catch (err) {
      toast.error(errorText(err, 'Could not update the category.'));
    } finally {
      setBusy(null);
    }
  };

  const del = async (row) => {
    const ok = await confirm({
      title: `Delete “${row.name}”?`,
      body: 'This removes the category for good. Only empty categories (no products, no subcategories) can be deleted.',
      confirmLabel: 'Delete category',
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
        toast.error(errorText(err, 'Could not delete the category.'));
      }
    }
  };

  const columns = [
    {
      key: 'name', header: 'Category', render: (r) => (
        <div className="flex min-w-[220px] items-center gap-2" style={{ paddingLeft: r.depth * 22 }}>
          {r.depth > 0 && <span className="text-slate-300" aria-hidden="true">└</span>}
          <div>
            <span className={`font-medium ${r.is_active ? 'text-slate-900' : 'text-slate-400'}`}>{r.name}</span>
            <span className="block font-mono text-xs text-slate-400">{r.slug}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'products', header: 'Products', render: (r) => (
        <span className="whitespace-nowrap text-sm">
          <span className="font-medium tabular-nums text-slate-900">{r.product_count ?? 0}</span>
          <span className="text-slate-500"> on website</span>
          {r.total_product_count !== undefined && r.total_product_count !== r.product_count && (
            <span className="block text-xs text-slate-400">{r.total_product_count} directly in it</span>
          )}
        </span>
      ),
    },
    {
      key: 'template', header: 'Spec template', render: (r) => {
        const t = templateInfo(r);
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openTemplate(r.id); }} className="text-left text-sm hover:underline">
            {t?.own ? <Badge tone="blue">Own · {t.count} fields</Badge>
              : t?.from ? <span className="text-slate-600">Uses {t.from}&apos;s</span>
                : <span className="text-slate-400">None — set up</span>}
          </button>
        );
      },
    },
    { key: 'sort', header: 'Sort', render: (r) => <SortInput row={r} onSave={(n) => patch(r, { sort_order: n }, `${r.name} moved.`)} /> },
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
          <IconButton icon={ClipboardList} label={`Spec template for ${r.name}`} onClick={() => openTemplate(r.id)} />
          <IconButton icon={FolderPlus} label={`Add a subcategory under ${r.name}`} onClick={() => setModal({ parentId: r.id })} />
          {isSuper && <IconButton icon={Trash2} tone="danger" label={`Delete ${r.name}`} onClick={() => del(r)} />}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Categories" description="How products are grouped on the website. Each category can have a spec template — the spec fields its products fill in."
        actions={<Button onClick={() => setModal({})}><Plus className="mr-2 h-4 w-4" />Add category</Button>} />
      <div role="note" className="mb-4 flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p><strong>Categories are product types</strong>, such as Laptops, Tablets or Chargers.</p>
          <p>
            Don&apos;t create categories for condition (Used / New) or brand (for example MacBook). Every product already has a condition and a brand,
            and the website builds pages like &quot;Used laptops&quot;, &quot;New laptops&quot; and brand pages from them automatically.
          </p>
          <p>
            For themes like &quot;Gaming laptops&quot;, use a Collection instead.{' '}
            <Link to="/admin/collections" className="font-medium underline">Manage collections</Link>
          </p>
        </div>
      </div>
      <DataTable columns={columns} rows={flat} loading={isLoading} error={error ? errorText(error, 'Could not load categories.') : null} onRetry={refetch}
        onRowClick={(r) => setModal({ editing: r })} empty="No categories yet." />

      {modal && (
        <CategoryModal key={modal.editing?.id || `new-${modal.parentId || ''}`} open editing={modal.editing ? byId.get(modal.editing.id) || modal.editing : null}
          parentId={modal.parentId || ''} rows={rows} flat={flat} onClose={() => setModal(null)} />
      )}
      <SpecTemplateEditor category={templateCategory} categories={rows} onClose={closeTemplate} onSwitchCategory={openTemplate} />
      {templateId && !templateCategory && !isLoading && (
        <p className="mt-4 text-sm text-slate-500">That category wasn&apos;t found. <button type="button" className="font-medium text-primary underline" onClick={closeTemplate}>Close</button></p>
      )}
    </div>
  );
};

export default Categories;
