import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AlertTriangle, ImagePlus, Loader2, Package, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { DataTable, Badge, PageHeader } from '../../../components/admin/DataTable';
import { Modal } from '../../../components/admin/Modal';
import { Field, TextInput, TextArea, Checkbox } from '../../../components/admin/Field';
import { Button } from '../../../components/ui/Button';
import { IconButton, MoveButtons, Switch, Tabs, Thumb, SrOnly } from '../../../components/admin/catalog/CatalogUi';
import { SingleImageField } from '../../../components/admin/catalog/SingleImageField';
import { ProductPickerPanel } from '../../../components/admin/catalog/ProductPicker';
import { BannerPreview } from '../../../components/admin/catalog/BannerPreview';
import { BANNER_STATUS, bannerStatus, isValidLink, moveItem, textOrNull } from '../../../components/admin/catalog/catalogUtils';
import {
  useCreateBannerMutation, useDeleteBannerMutation, useGetAdminProductQuery, useGetBannersAdminQuery,
  useReorderBannersMutation, useUpdateBannerMutation,
} from '../../../store/api/catalogApi';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';
import { formatDateTime, fromLocalInput, toLocalInput } from '../../../lib/format';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };
const EMPTY = [];
const PLACEMENTS = [
  { value: 'hero', label: 'Main banner (hero)', help: 'The big slider at the top of the homepage. Slides rotate in this order.' },
  { value: 'promo', label: 'Promo banners', help: 'Smaller offer banners further down the homepage.' },
];

/** Why a product slide is skipped on the website (the API hides these). */
const productProblem = (b) => {
  if (!b.product) return null;
  if (b.product.is_active === false) return 'Product is switched off — slide hidden';
  if (b.product.in_stock === false) return 'Product is out of stock — slide hidden';
  return null;
};

/** Price / photo / text defaults for a product slide, from the staff product view. */
const productFacts = (p) => {
  if (!p) return null;
  const active = (p.variants || []).filter((v) => v.is_active);
  const inStock = active.filter((v) => v.available > 0);
  const pool = [...(inStock.length ? inStock : active)].sort((a, b) => Number(a.effective_price) - Number(b.effective_price));
  const v = pool[0];
  const primary = (p.images || []).find((i) => i.is_primary) || (p.images || [])[0];
  return {
    name: p.name,
    subtitle: p.short_description || '',
    image: primary?.image_url || null,
    price: v ? v.effective_price : null,
    compareAt: v ? (v.is_on_sale ? v.price : v.compare_at_price) : null,
    inStock: inStock.length > 0,
    isActive: !!p.is_active,
  };
};

// ─── Create / edit modal ───────────────────────────────────

const formFrom = (b, type, placement) => ({
  type: b ? b.type || (b.product_id ? 'product' : 'custom') : type,
  placement: b?.placement || placement,
  product_id: b?.product_id || null,
  title: b?.title || '',
  subtitle: b?.subtitle || '',
  badge: b?.badge || '',
  cta_label: b?.cta_label || '',
  image_url: b?.image_url || '',
  mobile_image_url: b?.mobile_image_url || '',
  link_url: b?.link_url || '',
  starts_at: toLocalInput(b?.starts_at),
  ends_at: toLocalInput(b?.ends_at),
  is_active: b ? !!b.is_active : true,
});

const BannerModal = ({ editing, type, placement, onClose }) => {
  const toast = useToast();
  const [form, setForm] = useState(() => formFrom(editing, type, placement));
  // A new product slide starts by choosing the product (shown inside this dialog).
  const [picking, setPicking] = useState(!editing && type === 'product');
  const [errors, setErrors] = useState({});
  const [create, { isLoading: creating }] = useCreateBannerMutation();
  const [update, { isLoading: updating }] = useUpdateBannerMutation();
  const saving = creating || updating;
  const isProduct = form.type === 'product';
  const { data: product, isFetching: loadingProduct } = useGetAdminProductQuery(form.product_id, { skip: !form.product_id });
  const facts = productFacts(product);
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const slide = isProduct ? {
    title: form.title || facts?.name || editing?.product?.name,
    subtitle: form.subtitle || facts?.subtitle,
    badge: form.badge,
    cta: form.cta_label || 'Buy now',
    image: form.image_url || facts?.image || editing?.product?.image,
    mobileImage: form.image_url || facts?.image,
    price: facts?.price ?? null,
    compareAt: facts?.compareAt,
  } : {
    title: form.title, subtitle: form.subtitle, badge: form.badge, cta: form.cta_label,
    image: form.image_url, mobileImage: form.mobile_image_url, price: null,
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (isProduct && !form.product_id) errs.product = 'Pick a product.';
    if (!isProduct && !form.image_url) errs.image_url = 'Upload the banner image.';
    if (!isProduct && form.link_url.trim() && !isValidLink(form.link_url)) errs.link_url = 'Use a page of this website (starting with /) or a full link starting with https://';
    if (form.title.length > 120) errs.title = 'At most 120 characters.';
    if (form.subtitle.length > 200) errs.subtitle = 'At most 200 characters.';
    if (form.badge.length > 30) errs.badge = 'At most 30 characters.';
    if (form.cta_label.length > 40) errs.cta_label = 'At most 40 characters.';
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) errs.ends_at = 'Must be after the start.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = {
      placement: form.placement,
      product_id: isProduct ? form.product_id : null,
      title: textOrNull(form.title),
      subtitle: textOrNull(form.subtitle),
      badge: textOrNull(form.badge),
      cta_label: textOrNull(form.cta_label),
      image_url: form.image_url || null,
      mobile_image_url: isProduct ? null : form.mobile_image_url || null,
      starts_at: fromLocalInput(form.starts_at),
      ends_at: fromLocalInput(form.ends_at),
      is_active: form.is_active,
    };
    // Product slides link to the product page unless a link was saved before.
    if (!isProduct) body.link_url = textOrNull(form.link_url);
    try {
      if (editing) await update({ id: editing.id, ...body }).unwrap();
      else await create(body).unwrap();
      toast.success(editing ? 'Banner saved.' : 'Banner added.');
      onClose();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the banner.'));
    }
  };

  const title = editing ? 'Edit banner' : isProduct ? 'Add product slide' : 'Add custom banner';

  if (picking) {
    return (
      <Modal open onClose={onClose} size="lg" title="Choose a product" description="Only products that are switched on are listed."
        footer={<Button type="button" variant="outline" onClick={form.product_id ? () => setPicking(false) : onClose}>{form.product_id ? 'Back' : 'Cancel'}</Button>}>
        <ProductPickerPanel onPick={(p) => { set({ product_id: p.id }); setPicking(false); }} />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="xl" title={title}
        description={PLACEMENTS.find((p) => p.value === form.placement)?.label}
        footer={<>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="banner-form" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : editing ? 'Save changes' : 'Add banner'}</Button>
        </>}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form id="banner-form" onSubmit={submit} noValidate className="space-y-5">
            {isProduct ? (
              <div className="space-y-2">
                <span className="block text-sm font-medium text-slate-700">Product <span className="text-red-600">*</span></span>
                {form.product_id ? (
                  <div className="flex items-center gap-3 rounded-lg border p-2.5">
                    <Thumb src={facts?.image || editing?.product?.image} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{facts?.name || editing?.product?.name || '…'}</p>
                      {loadingProduct ? <p className="text-xs text-slate-400">Loading…</p> : facts && (
                        <p className={`text-xs ${facts.inStock && facts.isActive ? 'text-slate-500' : 'text-amber-700'}`}>
                          {!facts.isActive ? 'Switched off — the slide stays hidden until it is on again'
                            : !facts.inStock ? 'Out of stock — the slide stays hidden until stock is back'
                              : 'In stock · price updates automatically'}
                        </p>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Change</Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setPicking(true)}><Package className="mr-2 h-4 w-4" />Choose a product</Button>
                )}
                {errors.product && <p className="text-xs text-red-600">{errors.product}</p>}
                <p className="text-xs text-muted-foreground">Name, photo, price and link come from the product. Fill in the fields below only to override them.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <SingleImageField label="Image (computer) *" aspect="aspect-[16/7]" value={form.image_url || null}
                    onChange={(url) => set({ image_url: url || '' })} onError={(m) => toast.error(m)} hint="Wide, about 1600 × 700." />
                  {errors.image_url && <p className="mt-1 text-xs text-red-600">{errors.image_url}</p>}
                </div>
                <SingleImageField label="Image (phone)" aspect="aspect-[4/5]" value={form.mobile_image_url || null}
                  onChange={(url) => set({ mobile_image_url: url || '' })} onError={(m) => toast.error(m)} hint="Optional, tall." />
              </div>
            )}

            <Field label="Title" error={errors.title}>
              {(id) => <TextInput id={id} value={form.title} maxLength={120} onKeyDown={noEnter} onChange={(e) => set({ title: e.target.value })}
                placeholder={isProduct ? facts?.name || 'Product name' : 'e.g. Eid offers on gaming laptops'} />}
            </Field>
            <Field label="Subtitle" error={errors.subtitle}>
              {(id) => <TextArea id={id} rows={2} value={form.subtitle} maxLength={200} onChange={(e) => set({ subtitle: e.target.value })}
                placeholder={isProduct ? facts?.subtitle || 'Product short description' : 'One line under the title'} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Badge" error={errors.badge} hint="Small label above the title.">
                {(id) => <TextInput id={id} value={form.badge} maxLength={30} onKeyDown={noEnter} onChange={(e) => set({ badge: e.target.value })} placeholder="e.g. This week's pick" />}
              </Field>
              <Field label="Button text" error={errors.cta_label}>
                {(id) => <TextInput id={id} value={form.cta_label} maxLength={40} onKeyDown={noEnter} onChange={(e) => set({ cta_label: e.target.value })} placeholder={isProduct ? 'Buy now' : 'e.g. Shop now'} />}
              </Field>
            </div>
            {isProduct ? (
              <SingleImageField label="Custom image" aspect="aspect-[16/9]" value={form.image_url || null}
                onChange={(url) => set({ image_url: url || '' })} onError={(m) => toast.error(m)} hint="Optional. Leave empty to use the product's main photo." />
            ) : (
              <Field label="Link" error={errors.link_url} hint="A page of this website, e.g. /categories/laptops?condition=used, or a full link (https://…).">
                {(id) => <TextInput id={id} value={form.link_url} maxLength={2048} onKeyDown={noEnter} onChange={(e) => set({ link_url: e.target.value })} placeholder="/categories/laptops?condition=used" />}
              </Field>
            )}

            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">When to show it</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" hint="Dhaka time. Empty = straight away.">
                  {(id) => <TextInput id={id} type="datetime-local" value={form.starts_at} onKeyDown={noEnter} onChange={(e) => set({ starts_at: e.target.value })} />}
                </Field>
                <Field label="Until" error={errors.ends_at} hint="Dhaka time. Empty = no end.">
                  {(id) => <TextInput id={id} type="datetime-local" value={form.ends_at} onKeyDown={noEnter} onChange={(e) => set({ ends_at: e.target.value })} />}
                </Field>
              </div>
              <div className="mt-4"><Checkbox label="Switched on" hint="Switch off to take it down without deleting it." checked={form.is_active} onChange={(v) => set({ is_active: v })} /></div>
            </div>
          </form>
          <div className="lg:sticky lg:top-0 lg:self-start"><BannerPreview slide={slide} /></div>
        </div>
    </Modal>
  );
};

// ─── Page ──────────────────────────────────────────────────

const scheduleText = (b) => {
  if (!b.starts_at && !b.ends_at) return 'Always';
  if (b.starts_at && b.ends_at) return `${formatDateTime(b.starts_at)} – ${formatDateTime(b.ends_at)}`;
  return b.starts_at ? `From ${formatDateTime(b.starts_at)}` : `Until ${formatDateTime(b.ends_at)}`;
};

const Banners = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = useSelector((s) => s.auth.user?.role) === 'super_admin';
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'promo' ? 'promo' : 'hero';
  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetBannersAdminQuery(tab);
  const [modal, setModal] = useState(null); // { editing?, type? }
  const [busy, setBusy] = useState(null);
  const [update] = useUpdateBannerMutation();
  const [reorder, { isLoading: reordering }] = useReorderBannersMutation();
  const [remove] = useDeleteBannerMutation();
  const rows = useMemo(() => data.filter((b) => b.placement === tab), [data, tab]);
  const placement = PLACEMENTS.find((p) => p.value === tab);

  const toggle = async (b, value) => {
    setBusy(b.id);
    try {
      await update({ id: b.id, is_active: value }).unwrap();
      toast.success(value ? 'Banner switched on.' : 'Banner switched off.');
    } catch (err) {
      toast.error(errorText(err, 'Could not update the banner.'));
    } finally {
      setBusy(null);
    }
  };

  const move = async (from, to) => {
    const ids = moveItem(rows.map((r) => r.id), from, to);
    try {
      await reorder({ placement: tab, ids }).unwrap();
      toast.success('Order saved.');
    } catch (err) {
      toast.error(errorText(err, 'Could not change the order.'));
    }
  };

  const del = async (b) => {
    const ok = await confirm({
      title: 'Delete this banner?',
      body: 'It is removed from the homepage for good. To take it down for a while, switch it off instead.',
      confirmLabel: 'Delete banner',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(b.id).unwrap();
      toast.success('Banner deleted.');
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the banner.'));
    }
  };

  const columns = [
    {
      key: 'order', header: 'Order', className: 'w-24', render: (b) => {
        const i = rows.indexOf(b);
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="w-5 text-right text-sm tabular-nums text-slate-400">{i + 1}</span>
            <MoveButtons index={i} count={rows.length} label={`banner ${i + 1}`} onMove={move} disabled={reordering || isFetching} />
          </div>
        );
      },
    },
    { key: 'image', header: '', render: (b) => <Thumb src={b.image_url || b.product?.image} className="h-14 w-24" /> },
    {
      key: 'slide', header: 'Banner', render: (b) => {
        const problem = productProblem(b);
        return (
          <div className="min-w-[220px] max-w-[360px]">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-slate-900">{b.title || b.product?.name || 'Untitled banner'}</span>
              <Badge tone={b.product_id ? 'violet' : 'slate'}>{b.product_id ? 'Product' : 'Custom'}</Badge>
            </div>
            <p className="truncate text-xs text-slate-500">
              {b.product_id ? (b.title ? `Product: ${b.product?.name}` : `/products/${b.product?.slug || ''}`) : b.link_url || 'No link'}
            </p>
            {problem && <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{problem}</p>}
          </div>
        );
      },
    },
    { key: 'schedule', header: 'Shown', className: 'whitespace-nowrap text-sm text-slate-600', render: scheduleText },
    {
      key: 'status', header: 'Status', render: (b) => {
        const s = BANNER_STATUS[bannerStatus(b)];
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'active', header: 'On', render: (b) => <Switch checked={b.is_active} busy={busy === b.id} label="Switch banner on" onChange={(v) => toggle(b, v)} /> },
    {
      key: 'actions', header: <SrOnly>Actions</SrOnly>, render: (b) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Pencil} label="Edit banner" onClick={() => setModal({ editing: b })} />
          {isSuper && <IconButton icon={Trash2} tone="danger" label="Delete banner" onClick={() => del(b)} />}
        </div>
      ),
    },
  ];

  const unavailable = error && (error.status === 404 || error.status === 500);

  return (
    <div>
      <PageHeader title="Homepage banners" description="Choose what customers see first on the homepage."
        actions={<>
          <Button variant="outline" onClick={() => setModal({ type: 'custom' })}><ImagePlus className="mr-2 h-4 w-4" />Add custom banner</Button>
          <Button onClick={() => setModal({ type: 'product' })}><Package className="mr-2 h-4 w-4" />Add product slide</Button>
        </>} />
      <Tabs label="Banner placement" value={tab} onChange={(v) => setParams(v === 'hero' ? {} : { tab: v })}
        tabs={PLACEMENTS.map((p) => ({ value: p.value, label: p.label }))} />
      <p className="mb-4 text-sm text-slate-600">
        {placement.help} Product slides use the product&apos;s live price and disappear by themselves when it sells out.
        {' '}Only <b>Live</b> banners show on the website.
      </p>
      <DataTable columns={columns} rows={rows} loading={isLoading} onRetry={refetch}
        error={error ? (unavailable ? 'Homepage banners are not available on the server yet (a database update is pending).' : errorText(error, 'Could not load banners.')) : null}
        onRowClick={(b) => setModal({ editing: b })}
        empty={tab === 'hero' ? 'No slides yet. Add a product slide to feature a product at the top of the homepage.' : 'No promo banners yet.'} />
      {modal && (
        <BannerModal key={modal.editing?.id || `new-${modal.type}`} editing={modal.editing || null} type={modal.type} placement={tab} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default Banners;
