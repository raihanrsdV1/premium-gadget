import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  AlertCircle, BadgeInfo, Boxes, Camera, ClipboardList, Copy, Globe, ListChecks, Loader2, Plus, ShieldCheck, Trash2,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { SectionCard } from '../../../../components/admin/catalog/CatalogUi';
import { ImageManager } from '../../../../components/admin/catalog/ImageManager';
import { moveItem, sameJSON, textOrNull, uid } from '../../../../components/admin/catalog/catalogUtils';
import { useUnsavedChanges } from '../../../../components/admin/catalog/useUnsavedChanges';
import { useCreateProductMutation } from '../../../../store/api/catalogApi';
import { useDeleteMediaMutation } from '../../../../store/api/mediaApi';
import { useToast } from '../../../../hooks/useToast';
import { useConfirm } from '../../../../hooks/useConfirm';
import { errorText } from '../../../../lib/apiError';
import { EditorShell } from './EditorShell';
import { BasicsFields } from './BasicsFields';
import { ConditionFields } from './ConditionFields';
import { VariantFields } from './VariantFields';
import { SpecsFields } from './SpecsFields';
import { FeaturesFields } from './FeaturesFields';
import { SeoFields } from './SeoFields';
import { useTemplateState } from './useTemplateState';
import {
  SECTION_LABELS, basicsPayload, conditionPayload, emptyBasics, emptyCondition, emptySeo, emptySpecs, featuresPayload,
  newVariant, seoPayload, specsPayload, validateBasics, validateCondition, validateFeatures, validateSeo, validateSpecs,
  validateVariant, variantCreatePayload,
} from './productModel';

const blank = () => ({
  basics: emptyBasics(), condition: emptyCondition(), images: [], variants: [newVariant()],
  specs: emptySpecs(), features: [], seo: emptySeo(),
});

const hasKeys = (o) => Object.keys(o).length > 0;

/**
 * New product: one form, created with a single POST /products (variants with
 * starting stock, specs, key features and the uploaded photos), then the
 * editor of the new product opens.
 */
export const NewProduct = ({ categories, brands, branches }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const [initial] = useState(blank);
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [create, { isLoading: saving }] = useCreateProductMutation();
  const [deleteMedia] = useDeleteMediaMutation();
  const tpl = useTemplateState(form.basics.category_id, categories);

  const set = (key) => (valueOrFn) => setForm((f) => ({ ...f, [key]: typeof valueOrFn === 'function' ? valueOrFn(f[key]) : valueOrFn }));
  const patch = (key) => (p) => setForm((f) => ({ ...f, [key]: { ...f[key], ...p } }));
  const dirty = !saving && !sameJSON(form, initial);
  useUnsavedChanges(dirty);

  // Staff can only put starting stock in their own branch.
  const stockBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false && (isSuper || b.id === user?.branch_id)),
    [branches, isSuper, user?.branch_id]
  );

  const errors = useMemo(() => {
    const variants = form.variants.map((v) => validateVariant(v));
    return {
      basics: validateBasics(form.basics),
      condition: validateCondition(form.condition),
      variants,
      variantsAny: variants.some(hasKeys),
      specs: validateSpecs(form.specs, tpl.template),
      features: validateFeatures(form.features),
      seo: validateSeo(form.seo),
    };
  }, [form, tpl.template]);
  const shown = showErrors ? errors : { basics: {}, condition: {}, variants: [], specs: {}, features: {}, seo: {} };

  const sectionError = {
    basics: hasKeys(errors.basics), condition: hasKeys(errors.condition), variants: errors.variantsAny,
    specs: hasKeys(errors.specs), features: hasKeys(errors.features), seo: hasKeys(errors.seo),
  };
  const sections = ['basics', 'condition', 'photos', 'variants', 'specs', 'features', 'seo']
    .map((id) => ({ id, label: SECTION_LABELS[id], error: showErrors && sectionError[id] }));

  // ─── Photos (kept locally, attached by the create call) ───
  const images = form.images;
  const setImages = set('images');
  const onUploaded = (media) => setImages((list) => [
    ...list,
    ...media.map((m, i) => ({ id: m.id, url: m.url, alt_text: '', is_primary: list.length === 0 && i === 0 })),
  ]);
  const onDeleteImage = async (id) => {
    if (!(await confirm({ title: 'Remove this photo?', body: 'It will not be added to the product.', confirmLabel: 'Remove photo', danger: true }))) return;
    setImages((list) => {
      const next = list.filter((i) => i.id !== id);
      if (next.length && !next.some((i) => i.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
    setForm((f) => (f.seo.og_image_url && !f.images.some((i) => i.url === f.seo.og_image_url) ? { ...f, seo: { ...f.seo, og_image_url: '' } } : f));
    deleteMedia(id); // the unused upload; failures don't matter here
  };

  // ─── Variants ───
  const setVariant = (i, p) => set('variants')((vs) => vs.map((v, j) => (j === i ? { ...v, ...p } : v)));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const firstBad = ['basics', 'condition', 'variants', 'specs', 'features', 'seo'].find((k) => sectionError[k]);
    if (firstBad || !form.variants.length) {
      setShowErrors(true);
      toast.error(form.variants.length ? 'Some fields need attention — they are marked in red.' : 'Add at least one variant with a price.');
      document.getElementById(firstBad || 'variants')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const name = form.basics.name.trim();
    const body = {
      ...basicsPayload(form.basics, { isNew: true }),
      ...conditionPayload(form.condition),
      ...seoPayload(form.seo),
      variants: form.variants.map((v) => variantCreatePayload(v, { canSetCost: true, branchIds: stockBranches.map((b) => b.id) })),
      specifications: specsPayload(form.specs, tpl.template),
      key_features: featuresPayload(form.features),
      images: form.images.map((img) => ({ media_id: img.id, alt_text: textOrNull(img.alt_text) || name, is_primary: !!img.is_primary })),
    };
    try {
      const created = await create(body).unwrap();
      toast.success(`${created.name} created.`);
      navigate(`/admin/products/${created.id}`, { replace: true });
    } catch (err) {
      const msg = errorText(err, 'Could not create the product.');
      setSubmitError(msg);
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <EditorShell title="New product" description="Fill in the details, then press “Create product”. You can change everything later."
        sections={sections}>
        <SectionCard id="basics" icon={BadgeInfo} title={SECTION_LABELS.basics} description="Name, category and what customers read first.">
          <BasicsFields isNew value={form.basics} onChange={patch('basics')} errors={shown.basics} categories={categories} brands={brands} />
        </SectionCard>

        <SectionCard id="condition" icon={ShieldCheck} title={SECTION_LABELS.condition} description="For used items: grade, battery and honest notes. Warranty for every item.">
          <ConditionFields value={form.condition} onChange={patch('condition')} errors={shown.condition} condition={form.basics.condition} />
        </SectionCard>

        <SectionCard id="photos" icon={Camera} title={SECTION_LABELS.photos} description="Clear photos on a plain background sell best. The first upload becomes the main photo.">
          <ImageManager images={images} onUploaded={onUploaded} onError={(m) => toast.error(m)}
            onMove={(a, b) => setImages((l) => moveItem(l, a, b))}
            onMakePrimary={(id) => setImages((l) => l.map((i) => ({ ...i, is_primary: i.id === id })))}
            onAltChange={(id, text) => setImages((l) => l.map((i) => (i.id === id ? { ...i, alt_text: text } : i)))}
            onDelete={onDeleteImage} />
        </SectionCard>

        <SectionCard id="variants" icon={Boxes} title={SECTION_LABELS.variants}
          description="Each version you sell (e.g. 8GB / 256GB and 16GB / 512GB) with its own price and stock (stock codes are assigned automatically). One variant is enough for a single item.">
          {form.variants.map((v, i) => (
            <div key={v._uid} className="rounded-lg border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Variant {i + 1}{v.variant_name.trim() ? ` · ${v.variant_name.trim()}` : ''}</h3>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => set('variants')((vs) => [...vs.slice(0, i + 1), { ...v, _uid: uid('v'), sku: '', stock: {} }, ...vs.slice(i + 1)])}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />Duplicate
                  </Button>
                  {form.variants.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                      onClick={() => set('variants')((vs) => vs.filter((_, j) => j !== i))}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove
                    </Button>
                  )}
                </div>
              </div>
              <VariantFields idPrefix={v._uid} value={v} onChange={(p) => setVariant(i, p)} errors={shown.variants[i] || {}}
                stockBranches={stockBranches} />
            </div>
          ))}
          {!isSuper && <p className="text-xs text-slate-500">You can add starting stock for your own branch.</p>}
          <Button type="button" variant="outline" disabled={form.variants.length >= 50} onClick={() => set('variants')((vs) => [...vs, newVariant()])}>
            <Plus className="mr-2 h-4 w-4" />Add another variant
          </Button>
        </SectionCard>

        <SectionCard id="specs" icon={ClipboardList} title={SECTION_LABELS.specs} description="Technical details shown in the product's spec table.">
          <SpecsFields value={form.specs} onChange={set('specs')} errors={shown.specs} templateState={tpl} categoryId={form.basics.category_id} />
        </SectionCard>

        <SectionCard id="features" icon={ListChecks} title={SECTION_LABELS.features} description="Short selling points shown as bullets near the price.">
          <FeaturesFields value={form.features} onChange={set('features')} errors={shown.features} />
        </SectionCard>

        <SectionCard id="seo" icon={Globe} title={SECTION_LABELS.seo} description="How the product looks in Google results and when the link is shared.">
          <SeoFields value={form.seo} onChange={patch('seo')} errors={shown.seo} name={form.basics.name}
            slug={form.basics.slug || ''} fallbackDescription={form.basics.short_description} images={images} />
        </SectionCard>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create product'}
          </Button>
          <Link to="/admin/products" className="text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</Link>
          {submitError && <span role="alert" className="inline-flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" />{submitError}</span>}
        </div>
      </EditorShell>
    </form>
  );
};

export default NewProduct;
