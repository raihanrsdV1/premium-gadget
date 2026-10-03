const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { effectivePriceSql, compareAtPriceSql } = require('../../utils/pricing');
const { revalidate, TAGS } = require('../../lib/revalidate');
const { buildUpdate, auditData, highlightsFor } = require('../products/catalog.helpers');

/**
 * Banners: admin-curated homepage hero slides and promo slots. A slide
 * either promotes a product (title, image, price and stock resolved live
 * from the product) or is a custom image slide.
 */

const EFFECTIVE = effectivePriceSql('pv');
const COMPARE_AT = compareAtPriceSql('pv');
const ON_SALE = `(${EFFECTIVE} < pv.price)`;

// The storefront never needs more slides than this per placement.
const PUBLIC_LIMIT = 50;

const WRITABLE = [
  'placement', 'product_id', 'title', 'subtitle', 'badge', 'image_url', 'mobile_image_url',
  'cta_label', 'link_url', 'sort_order', 'is_active', 'starts_at', 'ends_at',
];

const PRIMARY_IMAGE = `(SELECT pi.image_url FROM product_images pi
   WHERE pi.product_id = p.id
   ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
   LIMIT 1)`;

const STATUS = `(CASE
    WHEN NOT bn.is_active THEN 'inactive'
    WHEN bn.ends_at IS NOT NULL AND bn.ends_at <= NOW() THEN 'expired'
    WHEN bn.starts_at IS NOT NULL AND bn.starts_at > NOW() THEN 'scheduled'
    ELSE 'live' END)`;

const DEFAULT_CTA = 'Buy now';

// ─── Public ─────────────────────────────────────────────────────────────────

/**
 * Live slides for one placement, in sort order. Product slides use the
 * cheapest IN-STOCK active variant's effective (sale-aware) price, and are
 * omitted when the product is inactive, deleted or out of stock.
 * @param {{ placement?: 'hero'|'promo' }} qp
 */
const getPublic = async ({ placement = 'hero' } = {}) => {
  const { rows } = await query(
    `SELECT bn.id, bn.product_id, bn.title, bn.subtitle, bn.badge, bn.image_url, bn.mobile_image_url,
            bn.cta_label, bn.link_url,
            p.slug, p.name AS product_name, p.short_description,
            p.condition::text AS condition_code, p.condition_grade, p.battery_health,
            b.name AS brand, ${PRIMARY_IMAGE} AS product_image,
            cv.price, cv.compare_at_price, cv.is_on_sale, cv.sale_ends_at
       FROM banners bn
       LEFT JOIN products p ON p.id = bn.product_id
       LEFT JOIN brands b   ON b.id = p.brand_id
       LEFT JOIN LATERAL (
         SELECT ${EFFECTIVE} AS price, ${COMPARE_AT} AS compare_at_price, ${ON_SALE} AS is_on_sale,
                CASE WHEN ${ON_SALE} THEN pv.sale_ends_at END AS sale_ends_at
           FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active
            AND EXISTS (SELECT 1 FROM inventory i WHERE i.variant_id = pv.id AND i.quantity - i.reserved > 0)
          ORDER BY 1 ASC, pv.created_at ASC, pv.id ASC
          LIMIT 1
       ) cv ON TRUE
      WHERE bn.placement = $1 AND bn.is_active
        AND (bn.starts_at IS NULL OR bn.starts_at <= NOW())
        AND (bn.ends_at   IS NULL OR bn.ends_at   >  NOW())
        AND (bn.product_id IS NULL
             OR (p.is_active AND p.deleted_at IS NULL AND cv.price IS NOT NULL))
      ORDER BY bn.sort_order ASC, bn.created_at ASC, bn.id ASC
      LIMIT $2`,
    [placement, PUBLIC_LIMIT]
  );

  const highlights = await highlightsFor({ query }, rows.filter((r) => r.product_id).map((r) => r.product_id));

  return rows.map((r) => {
    const isProduct = Boolean(r.product_id);
    return {
      id: r.id,
      type: isProduct ? 'product' : 'custom',
      title: r.title ?? (isProduct ? r.product_name : null),
      subtitle: r.subtitle ?? (isProduct ? r.short_description : null),
      badge: r.badge,
      image_url: r.image_url ?? (isProduct ? r.product_image : null),
      mobile_image_url: r.mobile_image_url,
      cta_label: r.cta_label ?? (isProduct ? DEFAULT_CTA : null),
      link_url: r.link_url ?? (isProduct ? `/products/${r.slug}` : null),
      product: isProduct
        ? {
            id: r.product_id,
            slug: r.slug,
            name: r.product_name,
            brand: r.brand,
            price: r.price,
            compare_at_price: r.compare_at_price,
            is_on_sale: r.is_on_sale,
            sale_ends_at: r.sale_ends_at,
            in_stock: true, // out-of-stock products are filtered out above
            condition_code: r.condition_code,
            condition_grade: r.condition_grade,
            battery_health: r.battery_health,
            highlights: highlights.get(r.product_id) || [],
          }
        : null,
    };
  });
};

// ─── Admin ──────────────────────────────────────────────────────────────────

const ADMIN_SELECT = `
  SELECT bn.*, ${STATUS} AS status,
         p.name AS product_name, p.slug AS product_slug,
         (p.is_active AND p.deleted_at IS NULL) AS product_is_active,
         ${PRIMARY_IMAGE} AS product_image,
         EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                  WHERE v.product_id = p.id AND v.is_active AND i.quantity - i.reserved > 0) AS product_in_stock
    FROM banners bn
    LEFT JOIN products p ON p.id = bn.product_id`;

/** Staff shape: every column plus type/status and a product summary. */
const toAdmin = (r) => {
  const { product_name, product_slug, product_is_active, product_image, product_in_stock, ...banner } = r;
  return {
    ...banner,
    type: banner.product_id ? 'product' : 'custom',
    product: banner.product_id
      ? {
          id: banner.product_id,
          name: product_name,
          slug: product_slug,
          image: product_image,
          is_active: product_is_active,
          in_stock: product_in_stock,
        }
      : null,
  };
};

/**
 * Every banner (any status) for the admin app, by placement then sort order.
 * @param {{ placement?: string, status?: string }} qp
 */
const getAdminList = async ({ placement, status } = {}) => {
  const { rows } = await query(
    `SELECT * FROM (${ADMIN_SELECT}
      WHERE ($1::text IS NULL OR bn.placement = $1)) x
      WHERE ($2::text IS NULL OR x.status = $2)
      ORDER BY x.placement, x.sort_order, x.created_at, x.id`,
    [placement ?? null, status ?? null]
  );
  return rows.map(toAdmin);
};

const getAdminById = async (db, id) => {
  const { rows } = await db.query(`${ADMIN_SELECT} WHERE bn.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Banner not found');
  return toAdmin(rows[0]);
};

/** A banner may point at any live (non-deleted) product, active or not. */
const assertProduct = async (db, productId) => {
  const { rows } = await db.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!rows.length) throw ApiError.badRequest('Product does not exist');
};

/**
 * Create a banner. Without a sort_order it goes to the end of its placement.
 * @param {object} data  - validated createSchema
 * @param {object} actor - req.user
 */
const create = async (data, actor) => {
  const banner = await withTransaction(async (client) => {
    if (data.product_id) await assertProduct(client, data.product_id);
    // Serialise "append to the end" per placement.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`banners:${data.placement}`]);
    const sortOrder = data.sort_order ?? (await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM banners WHERE placement = $1',
      [data.placement]
    )).rows[0].n;

    const cols = WRITABLE.filter((c) => c !== 'sort_order' && data[c] !== undefined);
    const values = [sortOrder, actor.id, ...cols.map((c) => data[c])];
    const { rows } = await client.query(
      `INSERT INTO banners (sort_order, created_by${cols.map((c) => `, ${c}`).join('')})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id`,
      values
    );
    const id = rows[0].id;
    await audit({ actor, action: 'banner.create', entity: 'banner', entityId: id, data: auditData(data), db: client });
    return getAdminById(client, id);
  });
  revalidate([TAGS.banners]);
  return banner;
};

/**
 * Partial update. The merged row must still have a product or an image,
 * and a window that ends after it starts.
 */
const update = async (id, data, actor) => {
  const banner = await withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM banners WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Banner not found');

    const merged = { ...current, ...data };
    if (!merged.product_id && !merged.image_url) throw ApiError.badRequest('A banner needs a product_id or an image_url');
    if (merged.starts_at && merged.ends_at && new Date(merged.ends_at) <= new Date(merged.starts_at)) {
      throw ApiError.badRequest('ends_at must be after starts_at');
    }
    if (data.product_id) await assertProduct(client, data.product_id);

    const values = [];
    const { sets } = buildUpdate(data, WRITABLE, values);
    if (sets.length) {
      values.push(id);
      await client.query(`UPDATE banners SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    await audit({ actor, action: 'banner.update', entity: 'banner', entityId: id, data: auditData(data), db: client });
    return getAdminById(client, id);
  });
  revalidate([TAGS.banners]);
  return banner;
};

/**
 * Set the order of one placement's banners. `ids` must list every banner of
 * that placement exactly once.
 * @returns {Promise<object[]>} the placement's banners in their new order
 */
const reorder = async ({ placement, ids }, actor) => {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id FROM banners WHERE placement = $1 ORDER BY id FOR UPDATE',
      [placement]
    );
    const known = new Set(rows.map((r) => r.id));
    const unique = new Set(ids);
    if (unique.size !== ids.length || unique.size !== known.size || ids.some((x) => !known.has(x))) {
      throw ApiError.badRequest(`Order must list every ${placement} banner exactly once`);
    }
    await client.query(
      `UPDATE banners bn SET sort_order = (t.ord - 1)::int
         FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ord)
        WHERE bn.id = t.id AND bn.placement = $2`,
      [ids, placement]
    );
    await audit({ actor, action: 'banner.reorder', entity: 'banner', data: { placement, order: ids }, db: client });
  });
  revalidate([TAGS.banners]);
  return getAdminList({ placement });
};

/** Hard-delete a banner (super_admin). */
const remove = async (id, actor) => {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'DELETE FROM banners WHERE id = $1 RETURNING placement, product_id, title',
      [id]
    );
    if (!rows[0]) throw ApiError.notFound('Banner not found');
    await audit({ actor, action: 'banner.delete', entity: 'banner', entityId: id, data: rows[0], db: client });
  });
  revalidate([TAGS.banners]);
};

module.exports = { getPublic, getAdminList, create, update, reorder, remove };
