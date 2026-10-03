const { z } = require('../../utils/validators');

/**
 * Category spec templates: the grouped spec fields a category's products
 * share (Processor → processor, generation, …). A category without its own
 * template inherits the nearest ancestor's, so "Laptops" covers Used / New /
 * MacBooks / Gaming.
 *
 * Product spec rows link to a template field through `field_key`; the row's
 * group_name / is_highlight are copied from the field when it is saved, and
 * re-synced whenever the template (or the product's category) changes.
 *
 * Kept free of config/database imports so scripts/seed.js can use it.
 */

const FIELD_TYPES = ['text', 'number', 'select', 'boolean'];
const MAX_GROUPS = 20;
const MAX_FIELDS_PER_GROUP = 40;
const MAX_OPTIONS = 50;
const MAX_HIGHLIGHTS = 4;
// Inheritance walks at most this many ancestors (defence against bad data).
const MAX_DEPTH = 32;
// Ungrouped spec rows are shown under this heading.
const OTHER_GROUP = 'Other';

const FIELD_KEY_RE = /^[a-z0-9_]{1,40}$/;
const fieldKey = z
  .string()
  .regex(FIELD_KEY_RE, 'Field key may only contain lowercase letters, digits and "_" (max 40)');

const issue = (ctx, path, message) => ctx.addIssue({ code: 'custom', path, message });

/** Flag case-insensitive duplicates of `pick(item)` within a list. */
const flagDuplicates = (items, pick, ctx, pathOf, message) => {
  const seen = new Set();
  items.forEach((item, i) => {
    const k = String(pick(item)).toLowerCase();
    if (seen.has(k)) issue(ctx, pathOf(i), message);
    seen.add(k);
  });
};

const fieldSchema = z
  .object({
    key: fieldKey,
    label: z.string().trim().min(1).max(60),
    type: z.enum(FIELD_TYPES),
    unit: z.string().trim().max(12).nullable().optional(),
    options: z.array(z.string().trim().min(1).max(80)).max(MAX_OPTIONS).optional(),
    highlight: z.boolean().optional(),
    filterable: z.boolean().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === 'select') {
      if (!f.options?.length) issue(ctx, ['options'], 'A select field needs at least one option');
      else flagDuplicates(f.options, (o) => o, ctx, (i) => ['options', i], 'Duplicate option');
    } else if (f.options?.length) {
      issue(ctx, ['options'], 'Options are only allowed on select fields');
    }
  })
  // Stored in one canonical shape so readers never deal with missing keys.
  .transform((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    unit: f.unit || null,
    ...(f.type === 'select' ? { options: f.options } : {}),
    highlight: Boolean(f.highlight),
    filterable: Boolean(f.filterable),
  }));

const groupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    fields: z.array(fieldSchema).max(MAX_FIELDS_PER_GROUP),
  })
  .strict();

/** A full template: `{ groups: [{ name, fields: [...] }] }`. */
const templateSchema = z
  .object({ groups: z.array(groupSchema).max(MAX_GROUPS) })
  .strict()
  .superRefine((t, ctx) => {
    flagDuplicates(t.groups, (g) => g.name, ctx, (i) => ['groups', i, 'name'], 'Duplicate group name');
    const seen = new Set();
    let highlights = 0;
    t.groups.forEach((g, gi) =>
      g.fields.forEach((f, fi) => {
        if (seen.has(f.key)) issue(ctx, ['groups', gi, 'fields', fi, 'key'], `Duplicate field key "${f.key}"`);
        seen.add(f.key);
        if (f.highlight) highlights += 1;
      })
    );
    if (highlights > MAX_HIGHLIGHTS) issue(ctx, ['groups'], `At most ${MAX_HIGHLIGHTS} fields can be highlights`);
  });

/**
 * PUT /categories/:id/spec-template body: the template object, or null to
 * clear it. The global JSON parser only accepts objects/arrays, so "null"
 * also arrives as `{ "template": null }` or as an empty body (what HTTP
 * clients send for a null body); `{ "template": {...} }` is accepted too.
 */
const putTemplateBodySchema = z.preprocess((body) => {
  if (body === null || body === undefined) return null;
  if (typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 0) return null;
    if (keys.length === 1 && keys[0] === 'template') return body.template ?? null;
  }
  return body;
}, templateSchema.nullable());

/** field key → { group, highlight, label, fieldIndex } for a stored template. */
const fieldIndex = (template) => {
  const map = new Map();
  (template?.groups || []).forEach((g) =>
    g.fields.forEach((f, fi) => map.set(f.key, { group: g.name, highlight: Boolean(f.highlight), label: f.label, fieldIndex: fi }))
  );
  return map;
};

/**
 * Fill group_name / is_highlight on spec rows about to be saved. A row whose
 * field_key is a template field takes that field's group and highlight flag;
 * any other row keeps its own group_name and is never a highlight.
 *
 * @param {Array<{ spec_key, spec_value, group_name?, field_key?, sort_order? }>} specs
 * @param {object|null} template - resolved template
 */
const applyTemplate = (specs, template) => {
  const index = fieldIndex(template);
  return specs.map((s) => {
    const field = s.field_key ? index.get(s.field_key) : null;
    return {
      ...s,
      field_key: s.field_key || null,
      group_name: field ? field.group : s.group_name || null,
      is_highlight: Boolean(field?.highlight),
    };
  });
};

/**
 * Public spec_groups: template groups in template order (fields in template
 * order, then any custom rows filed under the same group), then custom
 * groups in the order they first appear, then "Other" for ungrouped rows.
 *
 * @param {Array<{ spec_key, spec_value, group_name, field_key }>} rows - ordered by sort_order
 * @param {object|null} template
 * @returns {Array<{ name: string, items: Array<{ label, value, field_key }> }>}
 */
const groupSpecs = (rows, template) => {
  const index = fieldIndex(template);
  const templateGroups = (template?.groups || []).map((g) => g.name);
  const buckets = new Map();

  rows.forEach((r, i) => {
    const field = r.field_key ? index.get(r.field_key) : null;
    const name = field ? field.group : r.group_name || OTHER_GROUP;
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push({
      rank: field ? [0, field.fieldIndex, i] : [1, 0, i],
      item: { label: r.spec_key, value: r.spec_value, field_key: r.field_key || null },
    });
  });

  const inTemplate = new Set(templateGroups);
  const order = [
    ...templateGroups.filter((n) => buckets.has(n)),
    // Map keys keep insertion order = first appearance.
    ...[...buckets.keys()].filter((n) => !inTemplate.has(n) && n !== OTHER_GROUP),
    ...(buckets.has(OTHER_GROUP) && !inTemplate.has(OTHER_GROUP) ? [OTHER_GROUP] : []),
  ];
  const cmp = (a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2];
  return order.map((name) => ({ name, items: buckets.get(name).sort(cmp).map((e) => e.item) }));
};

// ─── Database helpers (take a pg client / pool) ───────────────────────────────

/**
 * The template that applies to a category: its own, else the nearest
 * ancestor's. Walks parent_id with a cycle guard and a depth cap.
 *
 * @param {{ query: Function }} db
 * @param {string} categoryId
 * @returns {Promise<{ template: object|null, source_category_id: string|null }>}
 */
const resolveTemplate = async (db, categoryId) => {
  const { rows } = await db.query(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id, spec_template, 0 AS depth, ARRAY[id] AS path
         FROM categories WHERE id = $1
       UNION ALL
       SELECT c.id, c.parent_id, c.spec_template, chain.depth + 1, chain.path || c.id
         FROM categories c
         JOIN chain ON c.id = chain.parent_id
        WHERE chain.spec_template IS NULL
          AND NOT c.id = ANY(chain.path)
          AND chain.depth < $2
     )
     SELECT id, spec_template FROM chain
      WHERE spec_template IS NOT NULL
      ORDER BY depth LIMIT 1`,
    [categoryId, MAX_DEPTH]
  );
  return rows[0]
    ? { template: rows[0].spec_template, source_category_id: rows[0].id }
    : { template: null, source_category_id: null };
};

/**
 * Re-apply a template to stored spec rows, scoped to one product or to the
 * products of some categories. Rows whose field_key is a template field
 * take its group and highlight flag; every other row stops being a highlight
 * (its group_name is kept).
 *
 * @param {{ query: Function }} db
 * @param {object|null} template
 * @param {{ productId?: string, categoryIds?: string[] }} scope
 */
const syncSpecRows = async (db, template, { productId, categoryIds }) => {
  const index = fieldIndex(template);
  const keys = [...index.keys()];
  const scope = productId
    ? 'ps.product_id = $1::uuid'
    : 'ps.product_id IN (SELECT id FROM products WHERE category_id = ANY($1::uuid[]))';
  const target = productId || categoryIds;
  if (!productId && !categoryIds?.length) return;

  if (keys.length) {
    await db.query(
      `UPDATE product_specifications ps
          SET group_name = t.group_name, is_highlight = t.highlight
         FROM unnest($2::text[], $3::text[], $4::bool[]) AS t(field_key, group_name, highlight)
        WHERE ${scope} AND ps.field_key = t.field_key
          AND (ps.group_name IS DISTINCT FROM t.group_name OR ps.is_highlight <> t.highlight)`,
      [target, keys, keys.map((k) => index.get(k).group), keys.map((k) => index.get(k).highlight)]
    );
  }
  await db.query(
    `UPDATE product_specifications ps SET is_highlight = FALSE
      WHERE ${scope} AND ps.is_highlight
        AND (ps.field_key IS NULL OR NOT (ps.field_key = ANY($2::text[])))`,
    [target, keys]
  );
};

/**
 * After a category's template or parent changed: re-sync the specs of every
 * product in that category and in descendants that inherit through it
 * (descendants with their own template are unaffected).
 */
const syncCategoryTree = async (db, categoryId) => {
  const { template } = await resolveTemplate(db, categoryId);
  const { rows } = await db.query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM categories WHERE id = $1
       UNION
       SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
        WHERE c.spec_template IS NULL
     )
     SELECT id FROM sub`,
    [categoryId]
  );
  await syncSpecRows(db, template, { categoryIds: rows.map((r) => r.id) });
};

module.exports = {
  FIELD_TYPES,
  MAX_HIGHLIGHTS,
  OTHER_GROUP,
  FIELD_KEY_RE,
  fieldKey,
  templateSchema,
  putTemplateBodySchema,
  fieldIndex,
  applyTemplate,
  groupSpecs,
  resolveTemplate,
  syncSpecRows,
  syncCategoryTree,
};
