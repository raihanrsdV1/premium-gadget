const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { paginatedResponse } = require('../../utils/pagination');
const { effectivePriceSql } = require('../../utils/pricing');
const { revalidate, TAGS, collectionTag, productTag } = require('../../lib/revalidate');
const { resolveSlug, buildUpdate, auditData } = require('../products/catalog.helpers');
const products = require('../products/product.service');
const { liveSql, DEFAULT_WINDOW_DAYS } = require('./badges');
const { WINDOWED, checkMerged } = require('./collection.validation');

/**
 * Collections: merchandising groups of products ("Hot sale", "New arrivals").
 * A collection is filled by hand (manual) or by a rule (newest, on_sale,
 * best_selling, featured). Only live collections and public products reach
 * the storefront.
 */

const LIVE = liveSql('c');
const WRITABLE = [
  'name', 'slug', 'description', 'badge_label', 'badge_tone', 'source', 'source_days',
  'show_on_home', 'home_limit', 'home_layout', 'is_active', 'starts_at', 'ends_at',
  'banner_url', 'meta_title', 'meta_description',
];

const PUBLIC_FIELDS = `c.id, c.name, c.slug, c.description, c.badge_label, c.badge_tone, c.source,
  c.home_layout, c.starts_at, c.ends_at, c.banner_url`;

const STATUS = `(CASE
    WHEN NOT c.is_active THEN 'off'
    WHEN c.ends_at IS NOT NULL AND c.ends_at <= NOW() THEN 'ended'
    WHEN c.starts_at IS NOT NULL AND c.starts_at > NOW() THEN 'scheduled'
    ELSE 'live' END)`;

// A manual list is capped, so auto-sourced previews use the same ceiling.
const ADMIN_PREVIEW_LIMIT = 200;

// ─── Source rules ───────────────────────────────────────────────────────────

const EFFECTIVE_V = effectivePriceSql('v');

/** Units of the product sold in the window: not cancelled/returned, POS sales not voided. */
const SOLD_UNITS = (daysParam) => `(
  SELECT COALESCE(SUM(oi.quantity), 0)
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN product_variants v ON v.id = oi.variant_id
   WHERE v.product_id = p.id
     AND o.status NOT IN ('cancelled', 'returned')
     AND o.voided_at IS NULL
     AND o.created_at >= NOW() - make_interval(days => ${daysParam})
)`;

/**
 * Extra WHERE (starting with AND) and ORDER BY for a collection's source,
 * appended to the shared public product query. Parameters are pushed onto
 * `params`.
 */
const sourceRules = (col, params) => {
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  const days = col.source_days ?? DEFAULT_WINDOW_DAYS;
  switch (col.source) {
    case 'manual': {
      const id = add(col.id);
      return {
        where: ` AND EXISTS (SELECT 1 FROM collection_products cp WHERE cp.collection_id = ${id}::uuid AND cp.product_id = p.id)`,
        order: `(SELECT cp.sort_order FROM collection_products cp WHERE cp.collection_id = ${id}::uuid AND cp.product_id = p.id) ASC, p.created_at DESC, p.id`,
      };
    }
    case 'newest': {
      const d = add(days);
      return {
        where: ` AND p.created_at >= NOW() - make_interval(days => ${d}::int)`,
        order: 'p.created_at DESC, p.id',
      };
    }
    case 'on_sale': {
      const pct = `(SELECT MAX((v.price - ${EFFECTIVE_V}) / NULLIF(v.price, 0))
                      FROM product_variants v
                     WHERE v.product_id = p.id AND v.is_active AND ${EFFECTIVE_V} < v.price)`;
      return { where: ` AND ${pct} IS NOT NULL`, order: `${pct} DESC, p.created_at DESC, p.id` };
    }
    case 'best_selling': {
      const d = add(days);
      const units = SOLD_UNITS(`${d}::int`);
      return { where: ` AND ${units} > 0`, order: `${units} DESC, p.created_at DESC, p.id` };
    }
    case 'featured':
      return { where: ' AND p.is_featured', order: 'p.sort_order ASC, p.created_at DESC, p.id' };
    default:
      throw new Error(`Unknown collection source ${col.source}`);
  }
};

/**
 * The public products of a collection in its source order (or a requested
 * sort), decorated with highlights, badges and low_stock.
 * @returns {Promise<{ rows: object[], total: number }>}
 */
const productsOf = async (col, { limit, offset = 0, sort } = {}) => {
  const params = [];
  const rules = sourceRules(col, params);
  const order = sort ? products.PUBLIC_SORTS[sort] : rules.order;
  const [data, count] = await Promise.all([
    query(
      `SELECT ${products.PUBLIC_COLUMNS} ${products.PUBLIC_FROM} ${rules.where}
        ORDER BY ${order}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS n ${products.PUBLIC_FROM} ${rules.where}`, params),
  ]);
  await products.decoratePublic(data.rows);
  return { rows: data.rows, total: count.rows[0].n };
};

// ─── Public ─────────────────────────────────────────────────────────────────

/** Live collections, in home order. */
const getLive = async () => {
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS} FROM collections c WHERE ${LIVE}
      ORDER BY c.home_sort_order, c.created_at, c.id`
  );
  return rows;
};

/** Live collections flagged for the home page, each with up to home_limit products; empty ones are left out. */
const getHome = async () => {
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS}, c.source_days, c.home_limit FROM collections c
      WHERE ${LIVE} AND c.show_on_home
      ORDER BY c.home_sort_order, c.created_at, c.id`
  );
  const filled = await Promise.all(
    rows.map(async (col) => {
      const { rows: items } = await productsOf(col, { limit: col.home_limit });
      const { source_days, home_limit, ...pub } = col;
      return { ...pub, products: items };
    })
  );
  return filled.filter((c) => c.products.length);
};

/**
 * One live collection with a page of its products. 404 if it isn't live.
 * @param {string} slug
 * @param {{ page?: number, limit?: number, sort?: string }} qp
 */
const getPublicBySlug = async (slug, qp = {}) => {
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS}, c.source_days, c.meta_title, c.meta_description
       FROM collections c WHERE c.slug = $1 AND ${LIVE}`,
    [slug]
  );
  if (!rows[0]) throw ApiError.notFound('Collection not found');
  const { source_days, ...collection } = rows[0];
  const page = qp.page || 1;
  const limit = qp.limit || 20;
  const { rows: items, total } = await productsOf(rows[0], { limit, offset: (page - 1) * limit, sort: qp.sort });
  const { pagination } = paginatedResponse(items, total, { page, limit });
  return { collection, products: items, pagination };
};

// ─── Admin reads ────────────────────────────────────────────────────────────

const countOf = async (col) => {
  if (col.source === 'manual') {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM collection_products cp
         JOIN products p ON p.id = cp.product_id AND p.deleted_at IS NULL
        WHERE cp.collection_id = $1`,
      [col.id]
    );
    return rows[0].n;
  }
  const params = [];
  const rules = sourceRules(col, params);
  const { rows } = await query(`SELECT COUNT(*)::int AS n ${products.PUBLIC_FROM} ${rules.where}`, params);
  return rows[0].n;
};

/** Every collection with product_count and status. */
const getAdminList = async () => {
  const { rows } = await query(
    `SELECT c.*, ${STATUS} AS status FROM collections c
      ORDER BY c.home_sort_order, c.created_at, c.id`
  );
  const counts = await Promise.all(rows.map(countOf));
  return rows.map((r, i) => ({ ...r, product_count: counts[i] }));
};

const loadAdmin = async (db, id) => {
  const { rows } = await db.query(`SELECT c.*, ${STATUS} AS status FROM collections c WHERE c.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Collection not found');
  return rows[0];
};

/**
 * The collection plus its products in order. Manual collections list every
 * member (inactive ones too, flagged); auto sources show their current
 * computed products, read-only.
 */
const getAdminById = async (id, db = { query }) => {
  const col = await loadAdmin(db, id);
  let items;
  if (col.source === 'manual') {
    ({ rows: items } = await db.query(
      `SELECT p.id, p.name, p.slug, p.is_active,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id
                ORDER BY pi.is_primary DESC, pi.sort_order, pi.created_at LIMIT 1) AS image,
              (SELECT MIN(${effectivePriceSql('pv')}) FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active) AS min_price
         FROM collection_products cp
         JOIN products p ON p.id = cp.product_id AND p.deleted_at IS NULL
        WHERE cp.collection_id = $1
        ORDER BY cp.sort_order, cp.added_at, p.id`,
      [id]
    ));
  } else {
    const { rows } = await productsOf(col, { limit: ADMIN_PREVIEW_LIMIT });
    items = rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, image: r.image, min_price: r.price, is_active: true }));
  }
  return { ...col, product_count: items.length, products: items };
};

// ─── Admin writes ───────────────────────────────────────────────────────────

const tagsFor = (...slugs) => [TAGS.collections, TAGS.products, ...slugs.filter(Boolean).map(collectionTag)];

/** source_days only means something for windowed sources. */
const normalizeSource = (data, current) => {
  const source = data.source ?? current?.source ?? 'manual';
  if (!WINDOWED.includes(source)) return { ...data, source_days: null };
  return data;
};

/** Run the cross-field rules on the merged state; throw 400 with the first message. */
const assertRules = (merged) => {
  const issues = [];
  checkMerged(merged, { addIssue: (i) => issues.push(i.message) });
  if (issues.length) throw ApiError.badRequest(issues[0]);
};

/**
 * Create a collection. It goes to the end of the home order.
 * @param {object} data  - validated createSchema
 * @param {object} actor - req.user
 */
const create = async (data, actor) => {
  const col = await withTransaction(async (client) => {
    const slug = await resolveSlug(client, 'collections', { name: data.name, slug: data.slug, fallback: 'collection' });
    const clean = normalizeSource({ ...data, slug }, null);
    assertRules(clean);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['collections:home-order']);
    const order = (await client.query('SELECT COALESCE(MAX(home_sort_order), -1) + 1 AS n FROM collections')).rows[0].n;

    const cols = WRITABLE.filter((c) => clean[c] !== undefined);
    const values = [order, ...cols.map((c) => clean[c])];
    const { rows } = await client.query(
      `INSERT INTO collections (home_sort_order${cols.map((c) => `, ${c}`).join('')})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      values
    );
    await audit({ actor, action: 'collection.create', entity: 'collection', entityId: rows[0].id, data: auditData(clean), db: client });
    return getAdminById(rows[0].id, client);
  });
  revalidate(tagsFor(col.slug));
  return col;
};

/** Partial update; the merged state must still satisfy the layout / window rules. */
const update = async (id, data, actor) => {
  let before;
  const col = await withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM collections WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Collection not found');
    before = current.slug;

    const patch = { ...data };
    if (patch.slug !== undefined && patch.slug !== current.slug) {
      patch.slug = await resolveSlug(client, 'collections', { slug: patch.slug, excludeId: id });
    }
    const clean = normalizeSource(patch, current);
    assertRules({ ...current, ...clean });
    // Switching away from manual leaves the member list unused; keep it so
    // switching back restores it.
    const values = [];
    const { sets } = buildUpdate(clean, WRITABLE, values);
    if (sets.length) {
      values.push(id);
      await client.query(`UPDATE collections SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    await audit({ actor, action: 'collection.update', entity: 'collection', entityId: id, data: auditData(clean), db: client });
    return getAdminById(id, client);
  });
  revalidate(tagsFor(before, col.slug));
  return col;
};

/** Hard-delete a collection (memberships cascade). */
const remove = async (id, actor) => {
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query('DELETE FROM collections WHERE id = $1 RETURNING name, slug, source', [id]);
    if (!rows[0]) throw ApiError.notFound('Collection not found');
    await audit({ actor, action: 'collection.delete', entity: 'collection', entityId: id, data: rows[0], db: client });
    return rows[0];
  });
  revalidate(tagsFor(row.slug));
};

/**
 * Replace a manual collection's ordered product list.
 * 409 for auto sources; unknown or deleted products are 400.
 */
const setProducts = async (id, productIds, actor) => {
  const slug = await withTransaction(async (client) => {
    const col = (await client.query('SELECT id, slug, source FROM collections WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!col) throw ApiError.notFound('Collection not found');
    if (col.source !== 'manual') throw ApiError.conflict('This collection fills itself automatically');

    if (productIds.length) {
      const { rows } = await client.query(
        'SELECT id FROM products WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
        [productIds]
      );
      if (rows.length !== productIds.length) throw ApiError.badRequest('One or more products do not exist');
    }
    await client.query('DELETE FROM collection_products WHERE collection_id = $1 AND product_id <> ALL($2::uuid[])', [id, productIds]);
    if (productIds.length) {
      await client.query(
        `INSERT INTO collection_products (collection_id, product_id, sort_order)
         SELECT $1, t.pid, (t.ord - 1)::int FROM unnest($2::uuid[]) WITH ORDINALITY AS t(pid, ord)
         ON CONFLICT (collection_id, product_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [id, productIds]
      );
    }
    await audit({
      actor, action: 'collection.products', entity: 'collection', entityId: id,
      data: { count: productIds.length, product_ids: productIds }, db: client,
    });
    return col.slug;
  });
  revalidate(tagsFor(slug));
  return getAdminById(id);
};

/** Set the home order: home_sort_order = index in `ids`. Unknown ids are 400. */
const setHomeOrder = async (ids, actor) => {
  const slugs = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['collections:home-order']);
    const { rows } = await client.query('SELECT id, slug FROM collections WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids]);
    if (rows.length !== ids.length) throw ApiError.badRequest('One or more collections do not exist');
    await client.query(
      `UPDATE collections c SET home_sort_order = (t.ord - 1)::int
         FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ord) WHERE c.id = t.id`,
      [ids]
    );
    await audit({ actor, action: 'collection.reorder', entity: 'collection', data: { order: ids }, db: client });
    return rows.map((r) => r.slug);
  });
  revalidate(tagsFor(...slugs));
  return getAdminList();
};

/**
 * Replace a product's manual collection memberships. New ones go to the end
 * of their collection; non-manual collections are 400.
 * @returns {Promise<Array<{ id: string, name: string, slug: string }>>}
 */
const setForProduct = async (productId, collectionIds, actor) => {
  const touched = new Set();
  const result = await withTransaction(async (client) => {
    const product = (await client.query(
      'SELECT id, slug FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [productId]
    )).rows[0];
    if (!product) throw ApiError.notFound('Product not found');

    if (collectionIds.length) {
      const { rows } = await client.query(
        'SELECT id, source, slug FROM collections WHERE id = ANY($1::uuid[])', [collectionIds]
      );
      if (rows.length !== collectionIds.length) throw ApiError.badRequest('One or more collections do not exist');
      if (rows.some((r) => r.source !== 'manual')) {
        throw ApiError.badRequest('Only manual collections can hold products by hand');
      }
      rows.forEach((r) => touched.add(r.slug));
    }
    const removed = await client.query(
      `DELETE FROM collection_products cp USING collections c
        WHERE cp.collection_id = c.id AND cp.product_id = $1 AND cp.collection_id <> ALL($2::uuid[])
        RETURNING c.slug`,
      [productId, collectionIds]
    );
    removed.rows.forEach((r) => touched.add(r.slug));
    if (collectionIds.length) {
      await client.query(
        `INSERT INTO collection_products (collection_id, product_id, sort_order)
         SELECT c.id, $1, COALESCE((SELECT MAX(cp.sort_order) + 1 FROM collection_products cp WHERE cp.collection_id = c.id), 0)
           FROM collections c WHERE c.id = ANY($2::uuid[])
         ON CONFLICT (collection_id, product_id) DO NOTHING`,
        [productId, collectionIds]
      );
    }
    await audit({
      actor, action: 'product.collections', entity: 'product', entityId: productId,
      data: { collection_ids: collectionIds }, db: client,
    });
    const { rows } = await client.query(
      `SELECT c.id, c.name, c.slug FROM collection_products cp JOIN collections c ON c.id = cp.collection_id
        WHERE cp.product_id = $1 ORDER BY c.home_sort_order, c.name, c.id`,
      [productId]
    );
    return { collections: rows, productSlug: product.slug };
  });
  revalidate([...tagsFor(...touched), productTag(result.productSlug)]);
  return result.collections;
};

module.exports = {
  getLive, getHome, getPublicBySlug, getAdminList, getAdminById,
  create, update, remove, setProducts, setHomeOrder, setForProduct,
};
