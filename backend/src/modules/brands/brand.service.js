const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { resolveSlug, buildUpdate, auditData, isUuid } = require('../products/catalog.helpers');
const { revalidateAfter, TAGS } = require('../../lib/revalidate');

const FIELDS = `b.id, b.name, b.slug, b.logo_url, b.sort_order, b.is_active,
  b.description, b.meta_title, b.meta_description, b.banner_url, b.created_at, b.updated_at`;

const WRITABLE = [
  'name', 'logo_url', 'sort_order', 'is_active',
  'description', 'meta_title', 'meta_description', 'banner_url',
];

// Products the storefront would list (matches GET /products).
const PRODUCT_COUNT = `(
  SELECT COUNT(*)::int FROM products p
   WHERE p.brand_id = b.id AND p.is_active AND p.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active)
)`;

/** Public brand list: active only, sorted by sort_order then name. */
const getAll = async () => {
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count
       FROM brands b WHERE b.is_active
      ORDER BY b.sort_order, b.name`
  );
  return rows;
};

/** Staff list: includes inactive brands. */
const getAdminList = async () => {
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count,
            (SELECT COUNT(*)::int FROM products p
              WHERE p.brand_id = b.id AND p.deleted_at IS NULL) AS total_product_count
       FROM brands b
      ORDER BY b.sort_order, b.name`
  );
  return rows;
};

/** Public single brand by id or slug; inactive brands are 404. */
const getOne = async (idOrSlug) => {
  const where = isUuid(idOrSlug) ? 'b.id = $1' : 'b.slug = $1';
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count
       FROM brands b WHERE ${where} AND b.is_active`,
    [idOrSlug]
  );
  if (!rows[0]) throw ApiError.notFound('Brand not found');
  return rows[0];
};

/**
 * Create a brand. The slug is derived from the name unless given.
 * @param {object} data  - validated createSchema
 * @param {object} actor - req.user
 */
const create = async (data, actor) =>
  withTransaction(async (client) => {
    const slug = await resolveSlug(client, 'brands', { name: data.name, slug: data.slug, fallback: 'brand' });
    const cols = WRITABLE.filter((c) => data[c] !== undefined);
    const values = [slug, ...cols.map((c) => data[c])];
    const { rows } = await client.query(
      `INSERT INTO brands (slug${cols.map((c) => `, ${c}`).join('')})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    const brand = rows[0];
    await audit({ actor, action: 'brand.create', entity: 'brand', entityId: brand.id, data: { name: brand.name, slug }, db: client });
    return brand;
  }).then(revalidateAfter([TAGS.brands]));

/** Partial update; a changed slug must stay unique. */
const update = async (id, data, actor) =>
  withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM brands WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Brand not found');

    const values = [];
    const { sets } = buildUpdate(data, WRITABLE, values);
    if (data.slug !== undefined && data.slug !== current.slug) {
      values.push(await resolveSlug(client, 'brands', { slug: data.slug, excludeId: id }));
      sets.push(`slug = $${values.length}`);
    }
    if (!sets.length) return current;

    values.push(id);
    const { rows } = await client.query(
      `UPDATE brands SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    await audit({ actor, action: 'brand.update', entity: 'brand', entityId: id, data: auditData(data), db: client });
    return rows[0];
  }).then(revalidateAfter([TAGS.brands, TAGS.products])); // product pages show the brand

/**
 * Hard-delete an unused brand. Brands still referenced by products (even
 * soft-deleted ones) must be deactivated instead.
 */
const remove = async (id, actor) =>
  withTransaction(async (client) => {
    const current = (await client.query('SELECT id, name FROM brands WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Brand not found');

    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE brand_id = $1', [id]);
    if (rows[0].n) {
      throw ApiError.conflict(
        `Brand is still used by ${rows[0].n} product(s). Deactivate it instead (is_active: false).`
      );
    }
    await client.query('DELETE FROM brands WHERE id = $1', [id]);
    await audit({ actor, action: 'brand.delete', entity: 'brand', entityId: id, data: { name: current.name }, db: client });
  }).then(revalidateAfter([TAGS.brands]));

module.exports = { getAll, getAdminList, getOne, create, update, remove };
