/**
 * Seeding helpers for spec templates, templated product specs and homepage
 * banners. Shared by scripts/seed.js (fresh database) and
 * scripts/seed-phase2.js (adds them to an already-seeded database).
 *
 * Only plain pg clients are used here (no app config), so the scripts run
 * without the API's environment.
 */
const { templateSchema, fieldIndex, applyTemplate } = require('../../modules/categories/spec-template');
const { IMAGES, CATEGORIES, SPEC_TEMPLATES, BANNERS } = require('./catalog');

/** The catalog templates, validated by the API's own schema (canonical shape). */
const parsedTemplates = () =>
  Object.fromEntries(Object.entries(SPEC_TEMPLATES).map(([slug, t]) => [slug, templateSchema.parse(t)]));

/** Template that applies to a catalog category slug: its own, else the nearest ancestor's. */
const catalogTemplateFor = (categorySlug, templates) => {
  const seen = new Set();
  for (let slug = categorySlug; slug && !seen.has(slug); slug = CATEGORIES.find((c) => c.slug === slug)?.parent) {
    seen.add(slug);
    if (templates[slug]) return templates[slug];
  }
  return null;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 months shop warranty", "2 years official brand warranty". */
const warrantyText = ({ months, type }) => {
  const span = months % 12 === 0 ? plural(months / 12, 'year') : plural(months, 'month');
  return `${span} ${type === 'brand' ? 'official brand' : 'shop'} warranty`;
};

/**
 * Spec rows for a catalog product, ready to insert: template rows (labelled
 * from the template) in template order, custom rows after the template rows
 * of their group, and a Warranty row derived from the product's warranty.
 *
 * @param {object} product  - entry of PRODUCTS
 * @param {object} template - the catalog template for its category
 * @returns {Array<{ spec_key, spec_value, field_key, group_name, is_highlight }>}
 */
const specRowsFor = (product, template) => {
  const index = fieldIndex(template);
  const groupOrder = new Map((template?.groups || []).map((g, i) => [g.name, i]));
  const rows = product.specs.map((s, i) => {
    if (Array.isArray(s)) {
      const [key, value] = s;
      const field = index.get(key);
      if (!field) throw new Error(`Seed data: "${key}" is not a field of the template for ${product.name}`);
      return { spec_key: field.label, spec_value: String(value), field_key: key, rank: [groupOrder.get(field.group), 0, field.fieldIndex] };
    }
    const g = groupOrder.has(s.group) ? groupOrder.get(s.group) : 1000;
    return { spec_key: s.label, spec_value: String(s.value), group_name: s.group || null, rank: [g, 1, i] };
  });
  if (index.has('warranty') && product.warranty && !rows.some((r) => r.field_key === 'warranty')) {
    const field = index.get('warranty');
    rows.push({ spec_key: field.label, spec_value: warrantyText(product.warranty), field_key: 'warranty', rank: [groupOrder.get(field.group), 0, field.fieldIndex] });
  }
  rows.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
  return applyTemplate(rows.map(({ rank, ...r }) => r), template);
};

/** Replace a product's spec rows (sort_order = list position). */
const replaceProductSpecs = async (client, productId, rows) => {
  await client.query('DELETE FROM product_specifications WHERE product_id = $1', [productId]);
  if (!rows.length) return;
  await client.query(
    `INSERT INTO product_specifications (product_id, spec_key, spec_value, field_key, group_name, is_highlight, sort_order)
     SELECT $1, k, v, fk, g, h, (ord - 1)::int
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::bool[]) WITH ORDINALITY AS t(k, v, fk, g, h, ord)`,
    [
      productId,
      rows.map((r) => r.spec_key),
      rows.map((r) => r.spec_value),
      rows.map((r) => r.field_key || null),
      rows.map((r) => r.group_name || null),
      rows.map((r) => Boolean(r.is_highlight)),
    ]
  );
};

/**
 * Insert the demo banners. Product slides whose product isn't in
 * `productIdByName` are skipped.
 * @returns {Promise<number>} banners inserted
 */
const insertBanners = async (client, productIdByName, createdBy = null) => {
  const next = { hero: 0, promo: 0 };
  let n = 0;
  for (const b of BANNERS) {
    const productId = b.product ? productIdByName[b.product] : null;
    if (b.product && !productId) continue;
    await client.query(
      `INSERT INTO banners (placement, product_id, title, subtitle, badge, image_url, cta_label, link_url, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        b.placement, productId, b.title || null, b.subtitle || null, b.badge || null,
        b.image ? IMAGES[b.image] : null, b.cta || null, b.link || null, next[b.placement]++, createdBy,
      ]
    );
    n += 1;
  }
  return n;
};

module.exports = { parsedTemplates, catalogTemplateFor, specRowsFor, replaceProductSpecs, insertBanners, warrantyText };
