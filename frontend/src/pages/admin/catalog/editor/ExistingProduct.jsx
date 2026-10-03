import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  BadgeInfo, Boxes, Camera, ClipboardList, ExternalLink, Globe, Layers, ListChecks, Loader2, Plus, ShieldCheck, Trash2,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/admin/DataTable';
import { SaveRow, SectionCard } from '../../../../components/admin/catalog/CatalogUi';
import { ImageManager } from '../../../../components/admin/catalog/ImageManager';
import { moveItem, sameJSON, storefrontProductUrl, textOrNull } from '../../../../components/admin/catalog/catalogUtils';
import { useUnsavedChanges } from '../../../../components/admin/catalog/useUnsavedChanges';
import {
  useAddProductImageMutation, useCreateVariantMutation, useDeleteProductImageMutation, useDeleteProductMutation,
  useReorderProductImagesMutation, useReplaceKeyFeaturesMutation, useReplaceSpecificationsMutation,
  useUpdateProductImageMutation, useUpdateProductMutation,
} from '../../../../store/api/catalogApi';
import { useToast } from '../../../../hooks/useToast';
import { useConfirm } from '../../../../hooks/useConfirm';
import { errorText } from '../../../../lib/apiError';
import { formatDateTime } from '../../../../lib/format';
import { EditorShell } from './EditorShell';
import { BasicsFields } from './BasicsFields';
import { ConditionFields } from './ConditionFields';
import { VariantFields } from './VariantFields';
import { VariantCard } from './VariantCard';
import { SpecsFields } from './SpecsFields';
import { FeaturesFields } from './FeaturesFields';
import { SeoFields } from './SeoFields';
import { PriceHistory } from './PriceHistory';
import { CollectionsFields } from './CollectionsFields';
import { useTemplateState } from './useTemplateState';
import {
  SECTION_LABELS, basicsFrom, basicsPayload, conditionFrom, conditionPayload, featuresFrom, featuresPayload, newVariant,
  seoFrom, seoPayload, specsFrom, specsPayload, validateBasics, validateCondition, validateFeatures, validateSeo,
  validateSpecs, validateVariant, variantCreatePayload, variantFrom, variantUpdatePayload,
} from './productModel';

const hasKeys = (o) => Object.keys(o).length > 0;

/**
 * A "draft or server value" section: `draft` is null until someone edits,
 * so saved changes (patched into the cache by the API layer) show at once.
 */
const useSection = (base, toPayload) => {
  const [draft, setDraft] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const value = draft ?? base;
  const dirty = draft !== null && !sameJSON(toPayload(draft), toPayload(base));
  const edit = (patchOrValue, merge = true) => setDraft((d) => (merge ? { ...(d ?? base), ...patchOrValue } : patchOrValue));
  const reset = () => { setDraft(null); setShowErrors(false); };
  return { value, dirty, edit, reset, showErrors, setShowErrors };
};

export const ExistingProduct = ({ product, categories, brands, branches }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const id = product.id;

  const [saveBasicsApi, { isLoading: savingBasics }] = useUpdateProductMutation();
  const [saveConditionApi, { isLoading: savingCondition }] = useUpdateProductMutation();
  const [saveSeoApi, { isLoading: savingSeo }] = useUpdateProductMutation();
  const [replaceSpecs, { isLoading: savingSpecs }] = useReplaceSpecificationsMutation();
  const [replaceFeatures, { isLoading: savingFeatures }] = useReplaceKeyFeaturesMutation();
  const [addImage] = useAddProductImageMutation();
  const [reorderImages, { isLoading: savingOrder }] = useReorderProductImagesMutation();
  const [updateImage] = useUpdateProductImageMutation();
  const [deleteImage] = useDeleteProductImageMutation();
  const [createVariant, { isLoading: addingVariant }] = useCreateVariantMutation();
  const [deleteProduct, { isLoading: deletingProduct }] = useDeleteProductMutation();

  // ─── Sections backed by PUT /products/:id ───
  const basicsBase = useMemo(() => basicsFrom(product), [product]);
  const basics = useSection(basicsBase, basicsPayload);
  const conditionBase = useMemo(() => conditionFrom(product), [product]);
  const condition = useSection(conditionBase, conditionPayload);
  const seoBase = useMemo(() => seoFrom(product), [product]);
  const seo = useSection(seoBase, seoPayload);

  // ─── Specs & key features ───
  const tpl = useTemplateState(product.category_id, categories);
  const specsBase = useMemo(() => specsFrom(product.specifications, tpl.template), [product.specifications, tpl.template]);
  const specs = useSection(specsBase, (v) => specsPayload(v, tpl.template));
  const featuresBase = useMemo(() => featuresFrom(product.key_features), [product.key_features]);
  const features = useSection(featuresBase, featuresPayload);

  const errors = {
    basics: validateBasics(basics.value),
    condition: validateCondition(condition.value),
    seo: validateSeo(seo.value),
    specs: validateSpecs(specs.value, tpl.template),
    features: validateFeatures(features.value),
  };

  // ─── Photos: upload / main / delete save at once; order + descriptions via Save ───
  const serverImages = product.images || [];
  const serverIds = serverImages.map((i) => i.id);
  const [orderDraft, setOrderDraft] = useState(null);
  const [altDraft, setAltDraft] = useState({});
  const [busyImage, setBusyImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const byId = new Map(serverImages.map((i) => [i.id, i]));
  const order = orderDraft
    ? [...orderDraft.filter((x) => byId.has(x)), ...serverIds.filter((x) => !orderDraft.includes(x))]
    : serverIds;
  const shownImages = order.map((imgId) => {
    const img = byId.get(imgId);
    return { id: imgId, url: img.image_url, alt_text: altDraft[imgId] ?? img.alt_text ?? '', is_primary: img.is_primary };
  });
  const orderDirty = !sameJSON(order, serverIds);
  const changedAlts = Object.entries(altDraft).filter(([k, v]) => byId.has(k) && (v ?? '') !== (byId.get(k).alt_text ?? ''));
  const photosDirty = orderDirty || changedAlts.length > 0;
  const [savingAlts, setSavingAlts] = useState(false);

  // ─── Variants ───
  const [variantDrafts, setVariantDrafts] = useState({});
  const [newVar, setNewVar] = useState(null);
  const [newVarErrors, setNewVarErrors] = useState(false);
  const variantDirty = (v) => !!variantDrafts[v.id] && hasKeys(variantUpdatePayload(variantDrafts[v.id], variantFrom(v)));
  const variantsDirty = product.variants.some(variantDirty) || (newVar !== null && !sameJSON({ ...newVar, _uid: 0 }, { ...newVariant(), _uid: 0 }));
  const stockBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false && (isSuper || b.id === user?.branch_id)),
    [branches, isSuper, user?.branch_id]
  );
  const activeBranches = useMemo(() => branches.filter((b) => b.is_active !== false), [branches]);

  const anyDirty = basics.dirty || condition.dirty || seo.dirty || specs.dirty || features.dirty || photosDirty || variantsDirty;
  useUnsavedChanges(anyDirty);

  const sections = [
    { id: 'basics', dirty: basics.dirty, error: basics.showErrors && hasKeys(errors.basics) },
    { id: 'condition', dirty: condition.dirty, error: condition.showErrors && hasKeys(errors.condition) },
    { id: 'photos', dirty: photosDirty },
    { id: 'variants', dirty: variantsDirty },
    { id: 'specs', dirty: specs.dirty, error: specs.showErrors && hasKeys(errors.specs) },
    { id: 'features', dirty: features.dirty, error: features.showErrors && hasKeys(errors.features) },
    { id: 'collections', dirty: false },
    { id: 'seo', dirty: seo.dirty, error: seo.showErrors && hasKeys(errors.seo) },
  ].map((s) => ({ ...s, label: SECTION_LABELS[s.id] }));

  /** Validate → call → reset the draft → toast. */
  const saveSection = (section, sectionErrors, call, label) => async () => {
    if (hasKeys(sectionErrors)) { section.setShowErrors(true); toast.error('Check the fields marked in red.'); return; }
    try {
      await call();
      section.reset();
      toast.success(`${label} saved.`);
    } catch (err) {
      toast.error(errorText(err, `Could not save ${label.toLowerCase()}.`));
    }
  };

  const onSaveBasics = saveSection(basics, errors.basics, () => saveBasicsApi({ id, ...basicsPayload(basics.value) }).unwrap(), 'Basics');
  const onSaveCondition = saveSection(condition, errors.condition, () => saveConditionApi({ id, ...conditionPayload(condition.value) }).unwrap(), 'Condition & warranty');
  const onSaveSeo = saveSection(seo, errors.seo, () => saveSeoApi({ id, ...seoPayload(seo.value) }).unwrap(), 'Google & sharing settings');
  const onSaveSpecs = saveSection(specs, errors.specs, () => replaceSpecs({ id, specifications: specsPayload(specs.value, tpl.template) }).unwrap(), 'Specifications');
  const onSaveFeatures = saveSection(features, errors.features, () => replaceFeatures({ id, key_features: featuresPayload(features.value) }).unwrap(), 'Key features');

  // ─── Photo actions ───
  const onUploaded = async (media) => {
    setUploading(true);
    let added = 0;
    try {
      for (const m of media) {
        await addImage({ id, media_id: m.id, alt_text: product.name }).unwrap();
        added += 1;
      }
      toast.success(`${added} photo${added === 1 ? '' : 's'} added.`);
    } catch (err) {
      toast.error(`${added ? `${added} added, then: ` : ''}${errorText(err, 'Could not add the photo.')}`);
    } finally {
      setUploading(false);
    }
  };
  const onMakePrimary = async (imageId) => {
    setBusyImage(imageId);
    try {
      await updateImage({ id, imageId, is_primary: true }).unwrap();
      toast.success('Main photo changed.');
    } catch (err) {
      toast.error(errorText(err, 'Could not change the main photo.'));
    } finally {
      setBusyImage(null);
    }
  };
  const onDeleteImage = async (imageId) => {
    const ok = await confirm({
      title: 'Delete this photo?',
      body: 'It is removed from the product straight away.',
      confirmLabel: 'Delete photo',
      danger: true,
    });
    if (!ok) return;
    setBusyImage(imageId);
    try {
      await deleteImage({ id, imageId }).unwrap();
      setAltDraft(({ [imageId]: _gone, ...rest }) => rest);
      toast.success('Photo deleted.');
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the photo.'));
    } finally {
      setBusyImage(null);
    }
  };
  const onSavePhotos = async () => {
    setSavingAlts(true);
    try {
      if (orderDirty) await reorderImages({ id, image_ids: order }).unwrap();
      for (const [imageId, text] of changedAlts) await updateImage({ id, imageId, alt_text: textOrNull(text) }).unwrap();
      setOrderDraft(null);
      setAltDraft({});
      toast.success('Photos saved.');
    } catch (err) {
      toast.error(errorText(err, 'Could not save the photos.'));
    } finally {
      setSavingAlts(false);
    }
  };

  // ─── Variant actions ───
  const onAddVariant = async (e) => {
    e.preventDefault();
    const errs = validateVariant(newVar);
    if (hasKeys(errs)) { setNewVarErrors(true); toast.error('Check the fields marked in red.'); return; }
    try {
      await createVariant({ productId: id, ...variantCreatePayload(newVar, { canSetCost: true, branchIds: stockBranches.map((b) => b.id) }) }).unwrap();
      toast.success(`${newVar.variant_name.trim()} added.`);
      setNewVar(null);
      setNewVarErrors(false);
    } catch (err) {
      toast.error(errorText(err, 'Could not add the variant.'));
    }
  };
  const newVarShownErrors = newVar && newVarErrors ? validateVariant(newVar) : {};

  const onDeleteProduct = async () => {
    const ok = await confirm({
      title: `Delete “${product.name}”?`,
      body: 'It disappears from the website and from the product list. Past orders and sales keep their records. To hide it for a while instead, switch off “Show on website”.',
      confirmLabel: 'Delete product',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProduct(id).unwrap();
      toast.success(`${product.name} deleted.`);
      basics.reset(); condition.reset(); seo.reset(); specs.reset(); features.reset();
      setOrderDraft(null); setAltDraft({}); setVariantDrafts({}); setNewVar(null);
      navigate('/admin/products', { replace: true });
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the product.'));
    }
  };

  const categoryChanged = basics.value.category_id !== product.category_id;
  const storefrontUrl = storefrontProductUrl(product.slug);

  return (
    <EditorShell
      title={product.name}
      description={<>
        {product.is_active ? <Badge tone="green">On website</Badge> : <Badge tone="amber">Hidden from website</Badge>}
        <span className="ml-2">Last saved {formatDateTime(product.updated_at)}</span>
      </>}
      sections={sections}
      actions={<>
        <a href={storefrontUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          title={product.is_active ? 'Opens the product page in a new tab' : 'Hidden products show “not found” on the website'}>
          View on website <ExternalLink className="h-4 w-4" />
        </a>
        {isSuper && (
          <Button type="button" variant="outline" className="text-red-600 hover:text-red-700" disabled={deletingProduct} onClick={onDeleteProduct}>
            <Trash2 className="mr-2 h-4 w-4" />Delete
          </Button>
        )}
      </>}>

      <SectionCard as="form" id="basics" icon={BadgeInfo} title={SECTION_LABELS.basics} description="Name, category and what customers read first."
        dirty={basics.dirty} onSubmit={onSaveBasics}
        footer={<SaveRow dirty={basics.dirty} saving={savingBasics} onDiscard={basics.reset} />}>
        <BasicsFields value={basics.value} onChange={basics.edit} errors={basics.showErrors ? errors.basics : {}} categories={categories} brands={brands} />
      </SectionCard>

      <SectionCard as="form" id="condition" icon={ShieldCheck} title={SECTION_LABELS.condition} description="For used items: grade, battery and honest notes. Warranty for every item."
        dirty={condition.dirty} onSubmit={onSaveCondition}
        footer={<SaveRow dirty={condition.dirty} saving={savingCondition} onDiscard={condition.reset} />}>
        <ConditionFields value={condition.value} onChange={condition.edit} errors={condition.showErrors ? errors.condition : {}} condition={basics.value.condition} />
      </SectionCard>

      <SectionCard as="form" id="photos" icon={Camera} title={SECTION_LABELS.photos}
        description="New photos, the main photo and deletions save straight away. Press “Save changes” after reordering or editing descriptions."
        dirty={photosDirty} onSubmit={onSavePhotos}
        headerExtra={uploading && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Adding photos…</span>}
        footer={<SaveRow dirty={photosDirty} saving={savingOrder || savingAlts} onDiscard={() => { setOrderDraft(null); setAltDraft({}); }} />}>
        <ImageManager images={shownImages} busyId={busyImage} disabled={uploading} onError={(m) => toast.error(m)}
          onUploaded={onUploaded}
          onMove={(a, b) => setOrderDraft(moveItem(order, a, b))}
          onMakePrimary={onMakePrimary}
          onAltChange={(imageId, text) => setAltDraft((d) => ({ ...d, [imageId]: text }))}
          onDelete={onDeleteImage} />
      </SectionCard>

      <SectionCard id="variants" icon={Boxes} title={SECTION_LABELS.variants} dirty={variantsDirty}
        description="Each variant saves on its own. Stock changes go through Inventory.">
        {product.variants.length === 0 && <p className="text-sm text-slate-500">No variants yet — add one so the product can be sold.</p>}
        {product.variants.map((v) => (
          <VariantCard key={v.id} variant={v} productId={id} isSuper={isSuper} branches={activeBranches}
            defaultOpen={product.variants.length <= 2}
            draft={variantDrafts[v.id] ?? null}
            setDraft={(d) => setVariantDrafts((all) => ({ ...all, [v.id]: d }))} />
        ))}

        <PriceHistory productId={id} />

        {newVar ? (
          <form onSubmit={onAddVariant} noValidate className="rounded-lg border-2 border-dashed border-primary/40 p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">New variant</h3>
            <VariantFields idPrefix="new-variant" value={newVar} onChange={(p) => setNewVar((v) => ({ ...v, ...p }))}
              errors={newVarShownErrors} stockBranches={stockBranches} />
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button type="submit" disabled={addingVariant}>
                {addingVariant ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add variant'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setNewVar(null); setNewVarErrors(false); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setNewVar(newVariant())}><Plus className="mr-2 h-4 w-4" />Add a variant</Button>
        )}
      </SectionCard>

      <SectionCard as="form" id="specs" icon={ClipboardList} title={SECTION_LABELS.specs} description="Technical details shown in the product's spec table."
        dirty={specs.dirty} onSubmit={onSaveSpecs}
        footer={<SaveRow dirty={specs.dirty} saving={savingSpecs} onDiscard={specs.reset} />}>
        <SpecsFields value={specs.value} onChange={(v) => specs.edit(v, false)} errors={specs.showErrors ? errors.specs : {}}
          templateState={tpl} categoryId={product.category_id}
          note={categoryChanged ? 'You picked a different category in Basics. Save Basics first to switch to that category’s spec fields.' : null} />
      </SectionCard>

      <SectionCard as="form" id="features" icon={ListChecks} title={SECTION_LABELS.features} description="Short selling points shown as bullets near the price."
        dirty={features.dirty} onSubmit={onSaveFeatures}
        footer={<SaveRow dirty={features.dirty} saving={savingFeatures} onDiscard={features.reset} />}>
        <FeaturesFields value={features.value} onChange={(v) => features.edit(v, false)} errors={features.showErrors ? errors.features : {}} />
      </SectionCard>

      <SectionCard id="collections" icon={Layers} title={SECTION_LABELS.collections} description="Hand-picked groups like “Hot Sale” that this product appears in. Changes save straight away.">
        <CollectionsFields product={product} isSuper={isSuper} />
      </SectionCard>

      <SectionCard as="form" id="seo" icon={Globe} title={SECTION_LABELS.seo} description="How the product looks in Google results and when the link is shared."
        dirty={seo.dirty} onSubmit={onSaveSeo}
        footer={<SaveRow dirty={seo.dirty} saving={savingSeo} onDiscard={seo.reset} />}>
        <SeoFields value={seo.value} onChange={seo.edit} errors={seo.showErrors ? errors.seo : {}} name={basics.value.name} slug={product.slug}
          fallbackDescription={product.short_description}
          images={serverImages.map((i) => ({ id: i.id, url: i.image_url, is_primary: i.is_primary }))} />
      </SectionCard>
    </EditorShell>
  );
};

export default ExistingProduct;
