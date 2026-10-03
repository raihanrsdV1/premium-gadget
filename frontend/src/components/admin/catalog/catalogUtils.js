// Helpers shared by the catalog screens (no components here, so Vite fast
// refresh keeps working for the component files).

export const CONDITIONS = [
  { value: 'new', label: 'New', tone: 'green' },
  { value: 'used', label: 'Used', tone: 'amber' },
  { value: 'refurbished', label: 'Refurbished', tone: 'violet' },
  { value: 'open_box', label: 'Open box', tone: 'blue' },
];
export const conditionInfo = (value) => CONDITIONS.find((c) => c.value === value) || { value, label: value || '—', tone: 'slate' };

export const WARRANTY_TYPES = [
  { value: '', label: 'Not set' },
  { value: 'brand', label: 'Brand warranty' },
  { value: 'shop', label: 'Shop warranty' },
  { value: 'none', label: 'No warranty' },
];

export const STOREFRONT_URL = (import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:3000').replace(/\/+$/, '');
export const storefrontProductUrl = (slug) => `${STOREFRONT_URL}/products/${slug}`;

/** "MacBook Air M2 (13")" → "macbook-air-m2-13" (same shape the API generates). */
export const slugify = (text) =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Spec field key from its label: "Battery life" → "battery_life". */
export const keyify = (text) =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');

export const SPEC_KEY_RE = /^[a-z0-9_]{1,40}$/;

let uidCounter = 0;
/** Stable React keys for rows that don't have a server id yet. */
export const uid = (prefix = 'row') => `${prefix}-${Date.now().toString(36)}-${(uidCounter += 1)}`;

/** Empty string → null, otherwise trimmed text. */
export const textOrNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === '' || s === undefined ? null : s;
};
/** Empty → null, otherwise a Number (NaN stays NaN for validation to catch). */
export const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const str = (v) => (v === null || v === undefined ? '' : String(v));

export const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Move an item inside an array (returns a new array). */
export const moveItem = (arr, from, to) => {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// ─── Category tree ──────────────────────────────────────────

/**
 * Flat category rows → depth-first ordered list with `depth` and `path`
 * ("Laptops › Used Laptops"). Orphans (parent missing) are shown at the top level.
 */
export const flattenCategories = (rows = []) => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map();
  rows.forEach((r) => {
    const parent = r.parent_id && byId.has(r.parent_id) ? r.parent_id : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(r);
  });
  const sort = (list) => [...list].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
  const out = [];
  const walk = (parentId, depth, trail) => {
    sort(children.get(parentId) || []).forEach((r) => {
      const names = [...trail, r.name];
      out.push({ ...r, depth, path: names.join(' › ') });
      walk(r.id, depth + 1, names);
    });
  };
  walk(null, 0, []);
  return out;
};

/** ids of a category and everything under it (a category can't move under these). */
export const descendantIds = (rows, id) => {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    rows.forEach((r) => {
      if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) { ids.add(r.id); grew = true; }
    });
  }
  return ids;
};

// ─── Spec templates ─────────────────────────────────────────

export const SPEC_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Pick from a list' },
  { value: 'boolean', label: 'Yes / No' },
];
export const MAX_HIGHLIGHTS = 4;

/** Value as stored on the product: the unit is appended once ("16" + "GB" → "16 GB"). */
export const withUnit = (value, unit) => {
  const v = String(value ?? '').trim();
  if (!v || !unit) return v;
  return v.toLowerCase().endsWith(unit.toLowerCase()) ? v : `${v} ${unit}`;
};

/** Inverse of withUnit for prefilling the form. */
export const withoutUnit = (value, unit) => {
  const v = String(value ?? '').trim();
  if (!unit) return v;
  const suffix = ` ${unit}`.toLowerCase();
  return v.toLowerCase().endsWith(suffix) ? v.slice(0, -suffix.length).trim() : v;
};

/** Every field of a template, in display order, with its group name. */
export const templateFields = (template) =>
  (template?.groups || []).flatMap((g) => (g.fields || []).map((f) => ({ ...f, group: g.name })));

// ─── Banners ────────────────────────────────────────────────

export const BANNER_STATUS = {
  live: { label: 'Live', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  expired: { label: 'Expired', tone: 'slate' },
  inactive: { label: 'Off', tone: 'amber' },
};

/** Status from the row (API) or worked out from the dates when missing. */
export const bannerStatus = (b, now = Date.now()) => {
  if (b.status && BANNER_STATUS[b.status]) return b.status;
  if (!b.is_active) return 'inactive';
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return 'expired';
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return 'scheduled';
  return 'live';
};

/** A site path ("/products?x=1", not "//evil.com") or an http(s) URL. */
export const isValidLink = (v) => {
  const s = String(v || '').trim();
  if (!s) return true;
  if (/^\/(?!\/)/.test(s)) return !/\s/.test(s);
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * The template that applies to a category, worked out from the staff list
 * (each row carries its OWN `spec_template`): its own, else the nearest
 * ancestor's. Used when GET /categories/:id/spec-template can't answer
 * (it only serves active categories). Returns null if the rows don't carry
 * templates at all.
 */
export const resolveTemplateLocal = (rows, id) => {
  if (!rows?.length || !rows.some((r) => 'spec_template' in r)) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(id);
  for (let depth = 0; cur && depth < 32; depth += 1) {
    if (cur.spec_template?.groups) return { template: cur.spec_template, source_category_id: cur.id };
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return { template: null, source_category_id: null };
};
