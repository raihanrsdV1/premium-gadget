// Form state ⇄ API payloads for the product editor. Form values are kept as
// strings while typing; payload builders convert them and drop empties.
import {
  numOrNull, str, textOrNull, templateFields, uid, withUnit, withoutUnit, SLUG_RE,
} from '../../../../components/admin/catalog/catalogUtils';
import { fromLocalInput, toLocalInput } from '../../../../lib/format';

/** Section ids → nav / heading labels. */
export const SECTION_LABELS = {
  basics: 'Basics',
  condition: 'Condition & warranty',
  photos: 'Photos',
  variants: 'Variants & prices',
  specs: 'Specifications',
  features: 'Key features',
  collections: 'Collections',
  seo: 'Google & sharing',
};

const isInt = (v) => /^-?\d+$/.test(String(v).trim());

// ─── Basics ─────────────────────────────────────────────────

export const emptyBasics = () => ({
  name: '', slug: '', slugTouched: false, category_id: '', brand_id: '', condition: 'new',
  short_description: '', description_md: '', badge: '',
  is_featured: false, is_active: true, is_serialized: false, sort_order: '0',
});

export const basicsFrom = (p) => ({
  name: p.name || '',
  slug: p.slug || '',
  slugTouched: true,
  category_id: p.category_id || '',
  brand_id: p.brand_id || '',
  condition: p.condition || 'new',
  short_description: p.short_description || '',
  description_md: p.description_md || '',
  badge: p.badge || '',
  is_featured: !!p.is_featured,
  is_active: !!p.is_active,
  is_serialized: !!p.is_serialized,
  sort_order: str(p.sort_order ?? 0),
});

/** For a new product the slug is only sent when someone typed one (the API makes a unique one otherwise). */
export const basicsPayload = (d, { isNew } = {}) => {
  const out = {
    name: d.name.trim(),
    category_id: d.category_id,
    brand_id: d.brand_id || null,
    condition: d.condition,
    short_description: textOrNull(d.short_description),
    description_md: d.description_md.trim() ? d.description_md : null,
    badge: textOrNull(d.badge),
    is_featured: !!d.is_featured,
    is_active: !!d.is_active,
    is_serialized: !!d.is_serialized,
    sort_order: Number(d.sort_order || 0),
  };
  const slug = d.slug.trim();
  if (slug && (!isNew || d.slugTouched)) out.slug = slug;
  return out;
};

export const validateBasics = (d) => {
  const e = {};
  if (d.name.trim().length < 2) e.name = 'Enter the product name (at least 2 characters).';
  else if (d.name.trim().length > 255) e.name = 'Keep the name under 255 characters.';
  if (d.slug.trim() && !SLUG_RE.test(d.slug.trim())) e.slug = 'Use lowercase letters, numbers and dashes only (e.g. macbook-air-m2).';
  if (!d.category_id) e.category_id = 'Pick a category.';
  if (d.short_description.length > 500) e.short_description = 'Keep it under 500 characters.';
  if (d.badge.trim().length > 40) e.badge = 'Keep the badge under 40 characters.';
  if (!isInt(d.sort_order || '0')) e.sort_order = 'Whole numbers only.';
  return e;
};

// ─── Condition & warranty ───────────────────────────────────

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'];

export const emptyCondition = () => ({
  condition_grade: '', battery_health: '', battery_cycles: '', accessories: '', condition_notes: '',
  warranty_months: '', warranty_type: '', warranty_notes: '',
});

export const conditionFrom = (p) => ({
  condition_grade: p.condition_grade || '',
  battery_health: str(p.battery_health),
  battery_cycles: str(p.battery_cycles),
  accessories: p.accessories || '',
  condition_notes: p.condition_notes || '',
  warranty_months: str(p.warranty_months),
  warranty_type: p.warranty_type || '',
  warranty_notes: p.warranty_notes || '',
});

export const conditionPayload = (d) => ({
  condition_grade: textOrNull(d.condition_grade),
  battery_health: numOrNull(d.battery_health),
  battery_cycles: numOrNull(d.battery_cycles),
  accessories: textOrNull(d.accessories),
  condition_notes: textOrNull(d.condition_notes),
  warranty_months: numOrNull(d.warranty_months),
  warranty_type: d.warranty_type || null,
  warranty_notes: textOrNull(d.warranty_notes),
});

const intIn = (v, min, max) => v === '' || (isInt(v) && Number(v) >= min && Number(v) <= max);

export const validateCondition = (d) => {
  const e = {};
  if (!intIn(d.battery_health, 0, 100)) e.battery_health = 'A whole number from 0 to 100.';
  if (!intIn(d.battery_cycles, 0, 100000)) e.battery_cycles = 'A whole number (0 or more).';
  if (!intIn(d.warranty_months, 0, 120)) e.warranty_months = 'A whole number of months, 0–120.';
  if (d.accessories.length > 2000) e.accessories = 'Keep it under 2000 characters.';
  if (d.condition_notes.length > 2000) e.condition_notes = 'Keep it under 2000 characters.';
  if (d.warranty_notes.length > 2000) e.warranty_notes = 'Keep it under 2000 characters.';
  return e;
};

// ─── SEO ────────────────────────────────────────────────────

export const emptySeo = () => ({ meta_title: '', meta_description: '', og_image_url: '' });
export const seoFrom = (p) => ({ meta_title: p.meta_title || '', meta_description: p.meta_description || '', og_image_url: p.og_image_url || '' });
export const seoPayload = (d) => ({
  meta_title: textOrNull(d.meta_title),
  meta_description: textOrNull(d.meta_description),
  og_image_url: d.og_image_url || null,
});
export const validateSeo = (d) => {
  const e = {};
  if (d.meta_title.length > 255) e.meta_title = 'At most 255 characters (about 60 show on Google).';
  if (d.meta_description.length > 500) e.meta_description = 'At most 500 characters (about 160 show on Google).';
  return e;
};

// ─── Variants ───────────────────────────────────────────────

export const PRICE_FIELDS = ['price', 'compare_at_price', 'sale_price', 'sale_starts_at', 'sale_ends_at'];

export const newVariant = () => ({
  _uid: uid('v'),
  variant_name: '', sku: '', color: '', attributes: [],
  price: '', compare_at_price: '', cost_price: '', sale_price: '', sale_starts_at: '', sale_ends_at: '',
  is_active: true, stock: {},
});

const money = (v) => (v === null || v === undefined ? '' : String(Number(v)));

export const variantFrom = (v) => ({
  _uid: v.id,
  id: v.id,
  variant_name: v.variant_name || '',
  sku: v.sku || '',
  color: v.color || '',
  attributes: (v.attributes || []).map((a) => ({ key: a.attribute_key, value: a.attribute_value })),
  price: money(v.price),
  compare_at_price: money(v.compare_at_price),
  cost_price: money(v.cost_price),
  sale_price: money(v.sale_price),
  sale_starts_at: toLocalInput(v.sale_starts_at),
  sale_ends_at: toLocalInput(v.sale_ends_at),
  is_active: !!v.is_active,
  stock: {},
});

const fieldValue = {
  variant_name: (d) => d.variant_name.trim(),
  // No sku: the system assigns it (PG-10001, …) and it never changes.
  color: (d) => textOrNull(d.color),
  price: (d) => Number(d.price),
  compare_at_price: (d) => numOrNull(d.compare_at_price),
  cost_price: (d) => numOrNull(d.cost_price),
  sale_price: (d) => numOrNull(d.sale_price),
  sale_starts_at: (d) => fromLocalInput(d.sale_starts_at),
  sale_ends_at: (d) => fromLocalInput(d.sale_ends_at),
  is_active: (d) => !!d.is_active,
  attributes: (d) => d.attributes.map((a) => ({ attribute_key: a.key, attribute_value: a.value })),
};

/** New variant (inside POST /products, or POST /products/:id/variants). */
export const variantCreatePayload = (d, { canSetCost, branchIds }) => {
  const out = {};
  Object.entries(fieldValue).forEach(([k, fn]) => {
    if (k === 'cost_price' && !canSetCost) return;
    const v = fn(d);
    if (v !== null) out[k] = v;
  });
  const stock = (branchIds || [])
    .filter((b) => str(d.stock[b]).trim() !== '')
    .map((b) => ({ branch_id: b, quantity: Number(d.stock[b]) }));
  if (stock.length) out.stock = stock;
  return out;
};

/** Only the fields that changed (the API rejects price changes from branch staff). */
export const variantUpdatePayload = (draft, original) => {
  const out = {};
  Object.entries(fieldValue).forEach(([k, fn]) => {
    const a = JSON.stringify(fn(draft));
    const b = JSON.stringify(fn(original));
    if (a !== b) out[k] = fn(draft);
  });
  return out;
};

const isMoney = (v) => /^\d+(\.\d{1,2})?$/.test(String(v).trim());

export const validateVariant = (d, { requireStockInts = true } = {}) => {
  const e = {};
  if (!d.variant_name.trim()) e.variant_name = 'Give the variant a name, e.g. “16GB / 512GB” or “Standard”.';
  if (!str(d.price).trim()) e.price = 'Enter the price.';
  else if (!isMoney(d.price) || Number(d.price) <= 0) e.price = 'Enter a price above 0 (at most 2 decimals).';
  ['compare_at_price', 'cost_price', 'sale_price'].forEach((k) => {
    if (str(d[k]).trim() && !isMoney(d[k])) e[k] = 'Numbers only (at most 2 decimals).';
  });
  const price = Number(d.price);
  if (!e.compare_at_price && str(d.compare_at_price).trim() && !(Number(d.compare_at_price) > price)) e.compare_at_price = 'The “was” price must be higher than the price.';
  if (!e.sale_price && str(d.sale_price).trim() && !(Number(d.sale_price) < price)) e.sale_price = 'The sale price must be lower than the price.';
  if (str(d.sale_price).trim() && Number(d.sale_price) <= 0) e.sale_price = 'Enter a sale price above 0.';
  if (d.sale_starts_at && d.sale_ends_at && d.sale_ends_at <= d.sale_starts_at) e.sale_ends_at = 'The sale must end after it starts.';
  if (requireStockInts) {
    Object.entries(d.stock || {}).forEach(([branch, q]) => {
      if (str(q).trim() && !(isInt(q) && Number(q) >= 0 && Number(q) <= 100000)) e[`stock.${branch}`] = 'Whole number, 0 or more.';
    });
  }
  return e;
};

// ─── Specifications ─────────────────────────────────────────

const toFieldInput = (field, value) => {
  if (field.type === 'boolean') {
    const v = String(value).trim().toLowerCase();
    if (['yes', 'true', '1'].includes(v)) return 'Yes';
    if (['no', 'false', '0'].includes(v)) return 'No';
    return String(value);
  }
  if (field.type === 'select') return String(value);
  return withoutUnit(value, field.unit);
};

/**
 * Product spec rows → form state. Rows saved against a template field (by
 * field_key — or, for older products, by the same label) fill that field;
 * everything else becomes a custom row.
 */
export const specsFrom = (specs = [], template) => {
  const fields = templateFields(template);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const byLabel = new Map(fields.map((f) => [f.label.trim().toLowerCase(), f]));
  const values = {};
  const custom = [];
  [...specs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach((s) => {
    let field = s.field_key ? byKey.get(s.field_key) : null;
    if (!field && !s.field_key) field = byLabel.get(String(s.spec_key).trim().toLowerCase());
    if (field && values[field.key] === undefined) values[field.key] = toFieldInput(field, s.spec_value);
    else custom.push({ _uid: s.id || uid('spec'), label: s.spec_key, value: s.spec_value, group: s.group_name || '' });
  });
  return { values, custom };
};

export const emptySpecs = () => ({ values: {}, custom: [] });

export const specsPayload = (d, template) => {
  const out = [];
  templateFields(template).forEach((f) => {
    const raw = d.values[f.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') return;
    const value = f.type === 'text' || f.type === 'number' ? withUnit(raw, f.unit) : String(raw).trim();
    out.push({ spec_key: f.label, spec_value: value, field_key: f.key, group_name: f.group });
  });
  d.custom.forEach((c) => {
    if (!c.label.trim() && !c.value.trim()) return;
    const item = { spec_key: c.label.trim(), spec_value: c.value.trim() };
    if (c.group.trim()) item.group_name = c.group.trim();
    out.push(item);
  });
  return out.map((s, i) => ({ ...s, sort_order: i }));
};

export const validateSpecs = (d, template) => {
  const e = {};
  templateFields(template).forEach((f) => {
    const raw = str(d.values[f.key]).trim();
    if (raw && f.type === 'number' && !/^-?\d+(\.\d+)?$/.test(raw)) e[f.key] = 'Numbers only.';
    if (raw.length > 2000) e[f.key] = 'Too long (2000 characters max).';
  });
  d.custom.forEach((c) => {
    const label = c.label.trim();
    const value = c.value.trim();
    if (label && !value) e[c._uid] = 'Add a value or remove the row.';
    else if (!label && value) e[c._uid] = 'Add a label or remove the row.';
    else if (label.length > 120) e[c._uid] = 'Label: at most 120 characters.';
    else if (value.length > 2000) e[c._uid] = 'Value: at most 2000 characters.';
    else if (c.group.trim().length > 80) e[c._uid] = 'Group: at most 80 characters.';
  });
  return e;
};

// ─── Key features ───────────────────────────────────────────

export const featuresFrom = (rows = []) => rows.map((r) => ({ _uid: r.id || uid('kf'), text: typeof r === 'string' ? r : r.feature }));
export const featuresPayload = (list) => list.map((f) => f.text.trim()).filter(Boolean);
export const validateFeatures = (list) => {
  const e = {};
  list.forEach((f) => { if (f.text.trim().length > 255) e[f._uid] = 'At most 255 characters.'; });
  return e;
};
