const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { paginatedResponse } = require('../../utils/pagination');
const { escapeLike } = require('../../utils/validators');
const { effectivePriceSql, compareAtPriceSql } = require('../../utils/pricing');
const { audit } = require('../../utils/audit');
const { resolveSlug, buildUpdate, auditData, isUuid, withHighlights } = require('./catalog.helpers');
const { pricingErrors } = require('./product.validation');
const { revalidate, productTags } = require('../../lib/revalidate');
const { withBadges, badgesFor } = require('../collections/badges');
const {
  MAX_HIGHLIGHTS, applyTemplate, groupSpecs, resolveTemplate, syncSpecRows,
} = require('../categories/spec-template');

// ─── SQL fragments ──────────────────────────────────────────────────────────

const EFFECTIVE = effectivePriceSql('pv');
const COMPARE_AT = compareAtPriceSql('pv');
// A live sale is exactly "the customer pays less than the regular price".
const ON_SALE = `(${EFFECTIVE} < pv.price)`;

// Human label kept for the storefront ("New" / "Pre-Owned"); condition_code
// carries the raw enum.
const CONDITION_LABEL = `(CASE p.condition::text
    WHEN 'new' THEN 'New'
    WHEN 'refurbished' THEN 'Refurbished'
    WHEN 'open_box' THEN 'Open Box'
    ELSE 'Pre-Owned' END)`;

const AVAILABLE = `COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.variant_id = pv.id), 0)::int`;

/**
 * FROM/WHERE shared by every public list. `cv` is the cheapest active
 * variant by effective price, so price and compare-at price always come from
 * the same variant; the inner LATERAL join drops products with no active
 * variant.
 */
const PUBLIC_FROM = `
  FROM products p
  LEFT JOIN brands b     ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN LATERAL (
    SELECT ${EFFECTIVE} AS price, ${COMPARE_AT} AS compare_at_price
      FROM product_variants pv
     WHERE pv.product_id = p.id AND pv.is_active
     ORDER BY 1 ASC, pv.created_at ASC, pv.id ASC
     LIMIT 1
  ) cv ON TRUE
  WHERE p.is_active AND p.deleted_at IS NULL`;

const PUBLIC_COLUMNS = `
  p.id, p.name, p.slug, p.short_description, p.is_featured,
  ${CONDITION_LABEL} AS condition,
  p.condition::text AS condition_code,
  b.name AS brand, b.slug AS brand_slug,
  c.name AS category, c.slug AS category_slug,
  cv.price, cv.compare_at_price,
  (SELECT pi.image_url FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
    LIMIT 1) AS image,
  EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
           WHERE v.product_id = p.id AND v.is_active AND i.quantity - i.reserved > 0) AS in_stock,
  (SELECT COALESCE(SUM(i.quantity - i.reserved), 0) BETWEEN 1 AND 3
     FROM product_variants v JOIN inventory i ON i.variant_id = v.id
    WHERE v.product_id = p.id AND v.is_active) AS low_stock,
  p.badge, p.condition_grade, p.warranty_months, p.updated_at`;

/**
 * Add the batched extras of a public product row (card highlights and
 * collection badges: one query each per list, never per row).
 */
const decoratePublic = async (rows) => {
  await Promise.all([withHighlights({ query }, rows), withBadges({ query }, rows)]);
  return rows;
};

// ORDER BY clauses come only from these allowlists.
const PUBLIC_SORTS = {
  newest: 'p.created_at DESC, p.id',
  price_asc: 'cv.price ASC, p.id',
  price_desc: 'cv.price DESC, p.id',
  name: 'p.name ASC, p.id',
};

const ADMIN_SORTS = {
  newest: 'p.created_at DESC, p.id',
  oldest: 'p.created_at ASC, p.id',
  name: 'p.name ASC, p.id',
  updated: 'p.updated_at DESC, p.id',
  sort_order: 'p.sort_order ASC, p.created_at DESC, p.id',
};

// Writable columns (allowlists for INSERT / UPDATE).
const PRODUCT_COLUMNS = [
  'name', 'short_description', 'description_md', 'category_id', 'brand_id',
  'condition', 'condition_notes', 'condition_grade', 'battery_health', 'battery_cycles',
  'accessories', 'warranty_months', 'warranty_type', 'warranty_notes',
  'badge', 'sort_order', 'og_image_url', 'is_featured', 'is_active', 'is_serialized',
  'meta_title', 'meta_description',
];

const VARIANT_COLUMNS = [
  'sku', 'variant_name', 'color', 'price', 'compare_at_price', 'cost_price',
  'sale_price', 'sale_starts_at', 'sale_ends_at', 'is_active',
];

const pageOf = (qp) => {
  const page = qp.page || 1;
  const limit = qp.limit || 20;
  return { page, limit, offset: (page - 1) * limit };
};

/** Append the public filters (category/brand/condition/price) to `params`. */
const publicFilterSql = (qp, params) => {
  const where = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (qp.category) {
    // The category itself or any direct child, so "laptops" includes
    // "macbooks" / "windows-laptops".
    const n = add(qp.category);
    where.push(`(c.slug = ${n} OR c.parent_id = (SELECT id FROM categories WHERE slug = ${n}))`);
  }
  if (qp.brand) where.push(`b.slug = ${add(qp.brand)}`);
  if (qp.condition) where.push(`p.condition = ${add(qp.condition)}::product_condition`);
  if (qp.min_price != null) where.push(`cv.price >= ${add(qp.min_price)}`);
  if (qp.max_price != null) where.push(`cv.price <= ${add(qp.max_price)}`);
  if (qp.in_stock) {
    where.push(`EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                         WHERE v.product_id = p.id AND v.is_active AND i.quantity - i.reserved > 0)`);
  }
  return where.length ? ` AND ${where.join(' AND ')}` : '';
};

// ─── Public ─────────────────────────────────────────────────────────────────

/**
 * Public product list with filters, sorting and pagination. Each row carries
 * `highlights` (≤ 4 key specs for the card), fetched in one extra query.
 * @param {object} qp - validated listQuerySchema
 */
const getAll = async (qp) => {
  const { page, limit, offset } = pageOf(qp);
  const params = [];
  const filters = publicFilterSql(qp, params);
  const order = PUBLIC_SORTS[qp.sort || 'newest'];

  const [data, count] = await Promise.all([
    query(
      `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_FROM} ${filters}
        ORDER BY ${order}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS n ${PUBLIC_FROM} ${filters}`, params),
  ]);
  await decoratePublic(data.rows);
  return paginatedResponse(data.rows, count.rows[0].n, { page, limit });
};

/**
 * Featured products for the home page, merchandised by sort_order.
 * @param {{ limit?: number }} qp
 */
const getFeatured = async ({ limit = 8 } = {}) => {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_FROM} AND p.is_featured
      ORDER BY p.sort_order ASC, p.created_at DESC, p.id
      LIMIT $1`,
    [limit]
  );
  return decoratePublic(rows);
};

/**
 * Typo-tolerant product search (pg_trgm word similarity on the name, plus a
 * literal substring match on name / brand / short description).
 * @param {object} qp - validated searchQuerySchema (q is ≥ 2 chars)
 */
const search = async (qp) => {
  const { page, limit, offset } = pageOf(qp);
  // $1 = raw term (trigram word-similarity via the <% operator, which can use
  //      idx_products_name_trgm); $2 = escaped %term% for ILIKE.
  const params = [qp.q, `%${escapeLike(qp.q)}%`];
  const match = `($1 <% p.name OR p.name ILIKE $2 OR b.name ILIKE $2 OR p.short_description ILIKE $2)`;
  const filters = publicFilterSql(qp, params);
  const order =
    !qp.sort || qp.sort === 'relevance'
      ? 'word_similarity($1, p.name) DESC, p.name ASC, p.id'
      : PUBLIC_SORTS[qp.sort];

  // Lower the word-similarity threshold (default 0.6) so common typos still
  // match. SET LOCAL is scoped to this transaction, so it never leaks onto a
  // pooled connection.
  const [data, count] = await withTransaction(async (client) => {
    await client.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.3');
    const d = await client.query(
      `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_FROM} AND ${match} ${filters}
        ORDER BY ${order}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await client.query(`SELECT COUNT(*)::int AS n ${PUBLIC_FROM} AND ${match} ${filters}`, params);
    return [d, c];
  });
  await decoratePublic(data.rows);
  return paginatedResponse(data.rows, count.rows[0].n, { page, limit });
};

/** Approved-review summary (reviews are owned by the reviews module). */
const ratingFor = async (db, productId) => {
  const { rows } = await db.query(
    `SELECT ROUND(AVG(rating)::numeric, 1)::float AS average, COUNT(*)::int AS count
       FROM reviews WHERE product_id = $1 AND is_approved`,
    [productId]
  );
  return { average: rows[0].average, count: rows[0].count };
};

/**
 * Public product detail. Variant `price` is the effective (sale-aware)
 * price; cost price is never selected. Inactive or deleted products are 404.
 *
 * Specs come three ways: `specifications` (flat [{ key, value }], unchanged),
 * `spec_groups` (grouped by the category's spec template) and `highlights`
 * (≤ 4 key specs).
 */
const getBySlug = async (slug) => {
  const prodResult = await query(
    `SELECT
       p.id, p.name, p.slug, p.short_description, p.description_md,
       p.category_id, p.brand_id, p.condition, p.condition::text AS condition_code,
       p.condition_notes, p.is_featured, p.is_active, p.meta_title, p.meta_description,
       p.created_at, p.updated_at, p.deleted_at, p.is_serialized,
       p.warranty_months, p.warranty_type, p.warranty_notes,
       p.condition_grade, p.battery_health, p.battery_cycles, p.accessories,
       p.badge, p.sort_order, p.og_image_url,
       ${CONDITION_LABEL} AS condition_label,
       b.name AS brand, b.slug AS brand_slug,
       c.name AS category, c.slug AS category_slug
     FROM products p
     LEFT JOIN brands     b ON b.id = p.brand_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.deleted_at IS NULL AND p.is_active`,
    [slug]
  );
  if (!prodResult.rows.length) throw ApiError.notFound('Product not found');
  const product = prodResult.rows[0];

  const varResult = await query(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.color,
            ${EFFECTIVE} AS price,
            ${COMPARE_AT} AS compare_at_price,
            pv.price AS regular_price,
            ${ON_SALE} AS is_on_sale,
            CASE WHEN ${ON_SALE} THEN pv.sale_ends_at END AS sale_ends_at,
            pv.is_active,
            ${AVAILABLE} AS available
       FROM product_variants pv
      WHERE pv.product_id = $1 AND pv.is_active
      ORDER BY ${EFFECTIVE} ASC, pv.created_at ASC`,
    [product.id]
  );
  const variants = varResult.rows;
  const ids = variants.map((v) => v.id);

  const [attrR, branchR, invR, specsR, featR, imgR, rating, resolved, badgeMap] = await Promise.all([
    query(
      `SELECT variant_id, attribute_key, attribute_value
         FROM variant_attributes WHERE variant_id = ANY($1::uuid[])
        ORDER BY sort_order ASC`,
      [ids]
    ),
    query('SELECT id, name FROM branches WHERE is_active ORDER BY name, id'),
    query(
      `SELECT variant_id, branch_id, (quantity - reserved)::int AS available
         FROM inventory WHERE variant_id = ANY($1::uuid[])`,
      [ids]
    ),
    query(
      `SELECT spec_key, spec_value, group_name, field_key, is_highlight
         FROM product_specifications WHERE product_id = $1 ORDER BY sort_order, id`,
      [product.id]
    ),
    query('SELECT feature FROM product_key_features WHERE product_id = $1 ORDER BY sort_order', [product.id]),
    query(
      `SELECT image_url, alt_text, is_primary, variant_id FROM product_images
        WHERE product_id = $1 ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
      [product.id]
    ),
    ratingFor({ query }, product.id),
    resolveTemplate({ query }, product.category_id),
    badgesFor({ query }, [product.id]),
  ]);
  const specs = specsR.rows;

  const attrMap = {};
  attrR.rows.forEach((a) => {
    (attrMap[a.variant_id] ||= {})[a.attribute_key] = a.attribute_value;
  });

  // Every active branch is listed, with 0 where there's no inventory row.
  const stock = new Map(invR.rows.map((r) => [`${r.variant_id}:${r.branch_id}`, r.available]));
  const availableAt = (variantId, branchId) => stock.get(`${variantId}:${branchId}`) || 0;
  const branchRow = (b, available) => ({ branch_id: b.id, branch_name: b.name, available });

  variants.forEach((v) => {
    v.attributes = attrMap[v.id] || {};
    v.branch_availability = branchR.rows.map((b) => branchRow(b, availableAt(v.id, b.id)));
  });

  const totalAvailable = variants.reduce((sum, v) => sum + v.available, 0);

  return {
    ...product,
    badges: badgeMap.get(product.id) || [],
    low_stock: totalAvailable >= 1 && totalAvailable <= 3,
    variants,
    branch_availability: branchR.rows.map((b) =>
      branchRow(b, variants.reduce((sum, v) => sum + availableAt(v.id, b.id), 0))
    ),
    specifications: specs.map((r) => ({ key: r.spec_key, value: r.spec_value })),
    spec_groups: groupSpecs(specs, resolved.template),
    highlights: specs
      .filter((r) => r.is_highlight)
      .slice(0, MAX_HIGHLIGHTS)
      .map((r) => ({ label: r.spec_key, value: r.spec_value })),
    key_features: featR.rows.map((r) => r.feature),
    images: imgR.rows.map((r) => r.image_url),
    image_list: imgR.rows.map((r) => ({
      url: r.image_url,
      alt_text: r.alt_text,
      is_primary: r.is_primary,
      variant_id: r.variant_id,
    })),
    rating,
  };
};

/**
 * Active variants of an active product (used by the storefront cart).
 * Inactive/deleted products yield an empty list.
 */
const getVariants = async (productId) => {
  const { rows } = await query(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.color,
            ${EFFECTIVE} AS price,
            ${COMPARE_AT} AS compare_at_price,
            pv.price AS regular_price,
            ${ON_SALE} AS is_on_sale,
            ${AVAILABLE} AS available
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
      WHERE pv.product_id = $1 AND pv.is_active
        AND p.is_active AND p.deleted_at IS NULL
      ORDER BY ${EFFECTIVE} ASC, pv.created_at ASC`,
    [productId]
  );
  return rows;
};

// Search engines accept at most 50,000 URLs per sitemap file.
const SITEMAP_LIMIT = 50000;

/**
 * Every active, non-deleted product for the storefront's sitemap.xml.
 * @returns {Promise<Array<{ slug: string, updated_at: Date, image: string|null }>>}
 */
const getSitemap = async () => {
  const { rows } = await query(
    `SELECT p.slug, p.updated_at,
            (SELECT pi.image_url FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
              LIMIT 1) AS image
       FROM products p
      WHERE p.is_active AND p.deleted_at IS NULL
      ORDER BY p.updated_at DESC, p.id
      LIMIT $1`,
    [SITEMAP_LIMIT]
  );
  return rows;
};

// ─── Admin reads ────────────────────────────────────────────────────────────

/**
 * Staff product list, including inactive products (never deleted ones).
 * @param {object} qp - validated adminListQuerySchema
 */
const getAdminList = async (qp) => {
  const { page, limit, offset } = pageOf(qp);
  const params = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ['p.deleted_at IS NULL'];

  if (qp.status === 'active') where.push('p.is_active');
  else if (qp.status === 'inactive') where.push('NOT p.is_active');
  if (qp.q) {
    const n = add(`%${escapeLike(qp.q)}%`);
    where.push(`(p.name ILIKE ${n} OR EXISTS (
      SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE ${n}))`);
  }
  if (qp.category) {
    const n = add(qp.category);
    where.push(
      isUuid(qp.category)
        ? `(p.category_id = ${n}::uuid OR c.parent_id = ${n}::uuid)`
        : `(c.slug = ${n} OR c.parent_id = (SELECT id FROM categories WHERE slug = ${n}))`
    );
  }
  if (qp.brand) {
    const n = add(qp.brand);
    where.push(isUuid(qp.brand) ? `p.brand_id = ${n}::uuid` : `b.slug = ${n}`);
  }
  if (qp.condition) where.push(`p.condition = ${add(qp.condition)}::product_condition`);
  if (qp.featured !== undefined) where.push(`p.is_featured = ${add(qp.featured)}`);
  if (qp.low_stock) {
    where.push(`EXISTS (
      SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
       WHERE v.product_id = p.id AND v.is_active
         AND i.quantity - i.reserved <= i.low_stock_threshold)`);
  }

  const joins = `
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b     ON b.id = p.brand_id`;
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [data, count] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.slug, p.condition, ${CONDITION_LABEL} AS condition_label,
              p.condition_grade, p.is_active, p.is_featured, p.badge, p.sort_order, p.created_at, p.updated_at,
              p.category_id, c.name AS category, p.brand_id, b.name AS brand,
              agg.variant_count, agg.active_variant_count, agg.total_stock, agg.available, agg.min_price, agg.max_price,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id
                ORDER BY pi.is_primary DESC, pi.sort_order, pi.created_at LIMIT 1) AS image
         ${joins}
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS variant_count,
                  (COUNT(*) FILTER (WHERE pv.is_active))::int AS active_variant_count,
                  COALESCE(SUM(s.qty), 0)::int AS total_stock,
                  COALESCE(SUM(s.avail), 0)::int AS available,
                  MIN(${EFFECTIVE}) FILTER (WHERE pv.is_active) AS min_price,
                  MAX(${EFFECTIVE}) FILTER (WHERE pv.is_active) AS max_price
             FROM product_variants pv
             LEFT JOIN LATERAL (
               SELECT SUM(i.quantity) AS qty, SUM(i.quantity - i.reserved) AS avail
                 FROM inventory i WHERE i.variant_id = pv.id
             ) s ON TRUE
            WHERE pv.product_id = p.id
         ) agg ON TRUE
         ${whereSql}
        ORDER BY ${ADMIN_SORTS[qp.sort || 'newest']}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS n ${joins} ${whereSql}`, params),
  ]);
  return paginatedResponse(data.rows, count.rows[0].n, { page, limit });
};

/** Variants with cost/sale fields, attributes and per-branch inventory (staff only). */
const loadAdminVariants = async (db, { productId, variantId }) => {
  const { rows: variants } = await db.query(
    `SELECT pv.id, pv.product_id, pv.sku, pv.variant_name, pv.color,
            pv.price, pv.compare_at_price, pv.cost_price,
            pv.sale_price, pv.sale_starts_at, pv.sale_ends_at,
            ${EFFECTIVE} AS effective_price, ${ON_SALE} AS is_on_sale,
            pv.is_active, pv.created_at, pv.updated_at
       FROM product_variants pv
      WHERE ${productId ? 'pv.product_id = $1' : 'pv.id = $1'}
      ORDER BY pv.created_at ASC, pv.id`,
    [productId || variantId]
  );
  const ids = variants.map((v) => v.id);
  if (!ids.length) return variants;

  const [attrs, inv] = await Promise.all([
    db.query(
      `SELECT id, variant_id, attribute_key, attribute_value, sort_order
         FROM variant_attributes WHERE variant_id = ANY($1::uuid[]) ORDER BY sort_order, id`,
      [ids]
    ),
    db.query(
      `SELECT i.id, i.variant_id, i.branch_id, br.name AS branch_name,
              i.quantity, i.reserved, (i.quantity - i.reserved) AS available,
              i.low_stock_threshold, i.updated_at
         FROM inventory i JOIN branches br ON br.id = i.branch_id
        WHERE i.variant_id = ANY($1::uuid[])
        ORDER BY br.name, i.id`,
      [ids]
    ),
  ]);
  // Child rows are grouped under their variant, so the FK column is dropped.
  const childrenOf = (rows, variantId) =>
    rows.filter((r) => r.variant_id === variantId).map((r) => {
      const out = { ...r };
      delete out.variant_id;
      return out;
    });
  for (const v of variants) {
    v.attributes = childrenOf(attrs.rows, v.id);
    v.inventory = childrenOf(inv.rows, v.id);
    v.total_stock = v.inventory.reduce((s, r) => s + r.quantity, 0);
    v.available = v.inventory.reduce((s, r) => s + r.available, 0);
  }
  return variants;
};

// Staff view of spec rows (group / template link / highlight included).
const SPEC_COLUMNS = 'id, spec_key, spec_value, sort_order, group_name, field_key, is_highlight';

const loadSpecs = (db, productId) =>
  db.query(
    `SELECT ${SPEC_COLUMNS} FROM product_specifications WHERE product_id = $1 ORDER BY sort_order, id`,
    [productId]
  );

const loadImages = async (db, productId) =>
  (
    await db.query(
      `SELECT id, image_url, alt_text, is_primary, sort_order, variant_id, created_at
         FROM product_images WHERE product_id = $1
        ORDER BY sort_order ASC, created_at ASC, id`,
      [productId]
    )
  ).rows;

/**
 * Full staff view of one product: inactive variants, cost and sale fields,
 * inventory rows, and ids for images / specs / features.
 */
const getAdminById = async (id, db = { query }) => {
  const { rows } = await db.query(
    `SELECT p.*, ${CONDITION_LABEL} AS condition_label,
            c.name AS category, c.slug AS category_slug,
            b.name AS brand, b.slug AS brand_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b     ON b.id = p.brand_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) throw ApiError.notFound('Product not found');

  const [variants, images, specs, features, rating, collections] = await Promise.all([
    loadAdminVariants(db, { productId: id }),
    loadImages(db, id),
    loadSpecs(db, id),
    db.query('SELECT id, feature, sort_order FROM product_key_features WHERE product_id = $1 ORDER BY sort_order, id', [id]),
    ratingFor(db, id),
    db.query(
      `SELECT c.id, c.name, c.slug FROM collection_products cp
         JOIN collections c ON c.id = cp.collection_id
        WHERE cp.product_id = $1 ORDER BY c.home_sort_order, c.name, c.id`,
      [id]
    ),
  ]);
  return {
    ...rows[0],
    collections: collections.rows,
    variants,
    images,
    specifications: specs.rows,
    key_features: features.rows,
    rating,
  };
};

// ─── Price history ──────────────────────────────────────────────────────────

const PRICE_HISTORY_MAX = 100;
const MONEY_FIELDS = new Set(['price', 'compare_at_price', 'cost_price', 'sale_price']);

/** Audit values keep their stored form (numeric strings); present money as numbers, dates as ISO. */
const historyValue = (field, v) => {
  if (v === null || v === undefined) return null;
  if (MONEY_FIELDS.has(field)) return Number(v);
  return new Date(v).toISOString();
};

/**
 * Selling-price changes of a product's variants, newest first, rebuilt from
 * the audit log (`variant.create` counts every price field as "from null").
 * Every staff member sees every price field (cost included: branch admins may
 * change it too). A row whose price fields didn't actually change is dropped.
 *
 * @param {string} productId
 */
const getPriceHistory = async (productId) => {
  const exists = await query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!exists.rows.length) throw ApiError.notFound('Product not found');

  const fields = PRICE_FIELDS;
  // Over-fetch: rows that only touched unchanged fields are dropped below.
  const { rows } = await query(
    `SELECT a.id, a.created_at, a.action, a.entity_id, a.data,
            u.id AS actor_id, u.full_name, u.role,
            pv.sku, pv.variant_name
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN product_variants pv ON pv.id = a.entity_id
      WHERE a.entity = 'variant' AND a.action IN ('variant.update', 'variant.create')
        AND a.data->>'product_id' = $1
        AND (a.action = 'variant.create' OR a.data->'after' ?| $2::text[])
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1000`,
    [productId, PRICE_FIELDS]
  );

  const out = [];
  for (const r of rows) {
    const d = r.data || {};
    const changes = [];
    for (const field of fields) {
      if (r.action === 'variant.create') {
        if (d[field] !== undefined && d[field] !== null) {
          changes.push({ field, from: null, to: historyValue(field, d[field]) });
        }
      } else if (d.after && d.after[field] !== undefined) {
        const before = d.before ? d.before[field] : undefined;
        if (!sameValue(before, d.after[field])) {
          changes.push({ field, from: historyValue(field, before), to: historyValue(field, d.after[field]) });
        }
      }
    }
    if (!changes.length) continue;
    out.push({
      at: r.created_at,
      actor: r.actor_id ? { id: r.actor_id, full_name: r.full_name, role: r.role } : null,
      variant_id: r.entity_id,
      sku: r.sku ?? d.sku ?? null,
      variant_name: r.variant_name ?? d.variant_name ?? null,
      changes,
    });
    if (out.length >= PRICE_HISTORY_MAX) break;
  }
  return out;
};

// ─── Write helpers ──────────────────────────────────────────────────────────

/** Lock a live (non-deleted) product row for the rest of the transaction. */
const lockProduct = async (client, id) => {
  const { rows } = await client.query(
    'SELECT id, slug, category_id FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id]
  );
  if (!rows[0]) throw ApiError.notFound('Product not found');
  return rows[0];
};

/**
 * Run a catalog write in a transaction. The callback reports the product
 * slugs it changed via `touch(slug)`; once the transaction commits (never on
 * rollback) the storefront is asked to revalidate those pages
 * (fire-and-forget, never delays the response).
 *
 * @template T
 * @param {(client: object, touch: (slug: string) => void) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const writeTx = async (fn) => {
  const slugs = new Set();
  const result = await withTransaction((client) => fn(client, (slug) => slugs.add(slug)));
  revalidate(productTags(...slugs));
  return result;
};

/** The spec template that applies to a category (own or inherited). */
const templateOf = async (db, categoryId) => (await resolveTemplate(db, categoryId)).template;

const assertRefs = async (db, { category_id, brand_id }) => {
  if (category_id) {
    const r = await db.query('SELECT 1 FROM categories WHERE id = $1', [category_id]);
    if (!r.rows.length) throw ApiError.badRequest('Category does not exist');
  }
  if (brand_id) {
    const r = await db.query('SELECT 1 FROM brands WHERE id = $1', [brand_id]);
    if (!r.rows.length) throw ApiError.badRequest('Brand does not exist');
  }
};

/** Branches must exist; branch staff may only stock their own branch. */
const assertBranches = async (db, branchIds, actor) => {
  if (!branchIds.length) return;
  if (actor.role !== 'super_admin' && branchIds.some((id) => id !== actor.branch_id)) {
    throw ApiError.forbidden('You can only add stock to your own branch');
  }
  const { rows } = await db.query('SELECT id FROM branches WHERE id = ANY($1::uuid[])', [branchIds]);
  if (rows.length !== branchIds.length) throw ApiError.badRequest('Branch does not exist');
};

/** SKUs are unique case-insensitively, within the payload and the catalog. */
const assertSkusFree = async (db, skus, excludeVariantId = null) => {
  const seen = new Set();
  for (const sku of skus) {
    const k = sku.toLowerCase();
    if (seen.has(k)) throw ApiError.conflict(`Duplicate SKU in request: ${sku}`);
    seen.add(k);
  }
  if (!skus.length) return;
  const { rows } = await db.query(
    `SELECT sku FROM product_variants
      WHERE LOWER(sku) = ANY($1::text[]) AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1`,
    [[...seen], excludeVariantId]
  );
  if (rows.length) throw ApiError.conflict(`SKU already exists: ${rows[0].sku}`);
};

const pricingOrThrow = (merged) => {
  const errs = pricingErrors(merged);
  if (errs.length) throw ApiError.badRequest(errs.map(([f, m]) => `${f}: ${m}`).join('; '));
};

const replaceAttributes = async (client, variantId, attrs) => {
  await client.query('DELETE FROM variant_attributes WHERE variant_id = $1', [variantId]);
  if (!attrs.length) return;
  await client.query(
    `INSERT INTO variant_attributes (variant_id, attribute_key, attribute_value, sort_order)
     SELECT $1, k, v, (ord - 1)::int FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS t(k, v, ord)`,
    [variantId, attrs.map((a) => a.attribute_key), attrs.map((a) => a.attribute_value)]
  );
};

/** Insert a variant with attributes and initial stock (ledgered). */
const insertVariant = async (client, productId, v, actor) => {
  const cols = VARIANT_COLUMNS.filter((c) => v[c] !== undefined);
  const values = [productId, ...cols.map((c) => v[c])];
  // clock_timestamp(), not NOW(): variants created in one transaction keep
  // their payload order (lists order by created_at).
  const { rows } = await client.query(
    `INSERT INTO product_variants (created_at, product_id${cols.map((c) => `, ${c}`).join('')})
     VALUES (clock_timestamp(), ${values.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING id, sku`,
    values
  );
  const variant = rows[0];
  if (v.attributes?.length) await replaceAttributes(client, variant.id, v.attributes);

  for (const s of v.stock || []) {
    await client.query(
      s.low_stock_threshold === undefined
        ? 'INSERT INTO inventory (variant_id, branch_id, quantity) VALUES ($1, $2, $3)'
        : 'INSERT INTO inventory (variant_id, branch_id, quantity, low_stock_threshold) VALUES ($1, $2, $3, $4)',
      [variant.id, s.branch_id, s.quantity, ...(s.low_stock_threshold === undefined ? [] : [s.low_stock_threshold])]
    );
    if (s.quantity > 0) {
      await client.query(
        `INSERT INTO stock_movements
           (variant_id, branch_id, movement_type, quantity_delta, reference_type, performed_by, note)
         VALUES ($1, $2, 'adjustment', $3, 'initial', $4, 'Initial stock')`,
        [variant.id, s.branch_id, s.quantity, actor.id]
      );
    }
  }
  return variant;
};

/**
 * Replace a product's spec rows. group_name / is_highlight of rows linked to
 * a template field come from `template`; sort_order defaults to list position.
 */
const replaceSpecs = async (client, productId, specs, template) => {
  await client.query('DELETE FROM product_specifications WHERE product_id = $1', [productId]);
  if (!specs.length) return;
  const rows = applyTemplate(specs, template);
  await client.query(
    `INSERT INTO product_specifications
       (product_id, spec_key, spec_value, group_name, field_key, is_highlight, sort_order)
     SELECT $1, k, v, g, fk, h, COALESCE(so, (ord - 1)::int)
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::bool[], $7::int[])
            WITH ORDINALITY AS t(k, v, g, fk, h, so, ord)`,
    [
      productId,
      rows.map((r) => r.spec_key),
      rows.map((r) => r.spec_value),
      rows.map((r) => r.group_name),
      rows.map((r) => r.field_key),
      rows.map((r) => r.is_highlight),
      rows.map((r) => r.sort_order ?? null),
    ]
  );
};

const replaceFeatures = async (client, productId, features) => {
  await client.query('DELETE FROM product_key_features WHERE product_id = $1', [productId]);
  if (!features.length) return;
  await client.query(
    `INSERT INTO product_key_features (product_id, feature, sort_order)
     SELECT $1, f, (ord - 1)::int FROM unnest($2::text[]) WITH ORDINALITY AS t(f, ord)`,
    [productId, features]
  );
};

/** media_id → its URL (share-locked so the upload can't be deleted mid-transaction). */
const resolveImageUrl = async (client, { media_id, image_url }) => {
  if (!media_id) return image_url;
  const { rows } = await client.query('SELECT url FROM media WHERE id = $1 FOR SHARE', [media_id]);
  if (!rows[0]) throw ApiError.badRequest('Uploaded image not found');
  return rows[0].url;
};

/**
 * Insert an image, keeping exactly one primary per product: the first image
 * is always primary, and a new primary replaces the old one. The caller must
 * hold the product row lock.
 */
const insertImage = async (client, productId, img) => {
  const { rows: [state] } = await client.query(
    `SELECT COUNT(*)::int AS n, COALESCE(MAX(sort_order), -1)::int AS max_sort
       FROM product_images WHERE product_id = $1`,
    [productId]
  );
  const primary = state.n === 0 || img.is_primary === true;
  if (primary && state.n > 0) {
    await client.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND is_primary', [productId]);
  }
  const { rows } = await client.query(
    `INSERT INTO product_images (product_id, variant_id, image_url, alt_text, sort_order, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, image_url, alt_text, is_primary, sort_order, variant_id, created_at`,
    [productId, img.variant_id || null, img.image_url, img.alt_text ?? null, img.sort_order ?? state.max_sort + 1, primary]
  );
  return rows[0];
};

/** Promote the first remaining image when a product has images but no primary. */
const ensurePrimary = async (client, productId) => {
  await client.query(
    `UPDATE product_images SET is_primary = TRUE
      WHERE id = (SELECT id FROM product_images WHERE product_id = $1
                   ORDER BY sort_order, created_at, id LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = $1 AND is_primary)`,
    [productId]
  );
};

const assertVariantOfProduct = async (db, variantId, productId) => {
  const { rows } = await db.query('SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2', [variantId, productId]);
  if (!rows.length) throw ApiError.badRequest('Variant does not belong to this product');
};

// ─── Products ───────────────────────────────────────────────────────────────

/**
 * Create a product with optional variants (attributes + initial stock),
 * specifications, key features and images — all in one transaction.
 * @param {object} data  - validated createProductSchema
 * @param {object} actor - req.user
 */
const create = async (data, actor) => {
  const id = await writeTx(async (client, touch) => {
    const variants = data.variants || [];
    await assertRefs(client, data);
    await assertSkusFree(client, variants.map((v) => v.sku).filter(Boolean));
    await assertBranches(
      client,
      [...new Set(variants.flatMap((v) => (v.stock || []).map((s) => s.branch_id)))],
      actor
    );

    const slug = await resolveSlug(client, 'products', { name: data.name, slug: data.slug, fallback: 'product' });
    touch(slug);
    const cols = PRODUCT_COLUMNS.filter((c) => data[c] !== undefined);
    const values = [slug, ...cols.map((c) => data[c])];
    const { rows } = await client.query(
      `INSERT INTO products (slug${cols.map((c) => `, ${c}`).join('')})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING id`,
      values
    );
    const productId = rows[0].id;

    const skuToId = new Map();
    for (const v of variants) {
      const created = await insertVariant(client, productId, v, actor);
      skuToId.set(created.sku.toLowerCase(), created.id);
    }
    if (data.specifications?.length) {
      await replaceSpecs(client, productId, data.specifications, await templateOf(client, data.category_id));
    }
    if (data.key_features?.length) await replaceFeatures(client, productId, data.key_features);
    for (const img of data.images || []) {
      let variantId = null;
      if (img.variant_sku) {
        variantId = skuToId.get(img.variant_sku.toLowerCase());
        if (!variantId) throw ApiError.badRequest(`Image refers to unknown variant SKU: ${img.variant_sku}`);
      }
      await insertImage(client, productId, {
        ...img,
        image_url: await resolveImageUrl(client, img),
        variant_id: variantId,
      });
    }

    await audit({
      actor,
      action: 'product.create',
      entity: 'product',
      entityId: productId,
      data: { name: data.name, slug, variants: variants.map((v) => v.sku) },
      db: client,
    });
    return productId;
  });
  return getAdminById(id);
};

/**
 * Partial update of product fields. A changed slug must stay unique; a
 * changed category re-applies the new category's spec template to the
 * product's spec rows.
 */
const update = async (id, data, actor) => {
  await writeTx(async (client, touch) => {
    const current = await lockProduct(client, id);
    touch(current.slug);
    await assertRefs(client, data);

    const values = [];
    const { sets } = buildUpdate(data, PRODUCT_COLUMNS, values);
    if (data.slug !== undefined && data.slug !== current.slug) {
      const slug = await resolveSlug(client, 'products', { slug: data.slug, excludeId: id });
      touch(slug);
      values.push(slug);
      sets.push(`slug = $${values.length}`);
    }
    if (!sets.length) return;
    values.push(id);
    await client.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    if (data.category_id && data.category_id !== current.category_id) {
      await syncSpecRows(client, await templateOf(client, data.category_id), { productId: id });
    }
    await audit({ actor, action: 'product.update', entity: 'product', entityId: id, data: auditData(data), db: client });
  });
  return getAdminById(id);
};

/** Soft delete: hidden everywhere, kept for order history. */
/**
 * Soft delete: the row stays for order history (order lines keep their own
 * sku/name snapshot), but its slug and variant SKUs are retired with a
 * `~d<id>` suffix so a new product can reuse them. The originals are kept in
 * the audit entry.
 */
const remove = async (id, actor) => {
  const suffix = `~d${id.slice(0, 8)}`;
  const slug = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT slug FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!rows[0]) throw ApiError.notFound('Product not found');
    await client.query(
      `UPDATE products SET deleted_at = NOW(), is_active = FALSE,
              slug = LEFT(slug, ${140 - suffix.length}) || $2
        WHERE id = $1`,
      [id, suffix]
    );
    const skus = await client.query(
      `UPDATE product_variants pv SET sku = LEFT(pv.sku, ${60 - suffix.length}) || $2
         FROM product_variants old
        WHERE old.id = pv.id AND pv.product_id = $1
        RETURNING old.sku`,
      [id, suffix]
    );
    await audit({
      actor,
      action: 'product.delete',
      entity: 'product',
      entityId: id,
      data: { slug: rows[0].slug, skus: skus.rows.map((r) => r.sku) },
      db: client,
    });
    return rows[0].slug;
  });
  revalidate(productTags(slug));
};

// ─── Variants ───────────────────────────────────────────────────────────────

/** Add a variant (with optional attributes / initial stock) to a product. */
const createVariant = async (productId, data, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    await assertSkusFree(client, [data.sku].filter(Boolean));
    await assertBranches(client, [...new Set((data.stock || []).map((s) => s.branch_id))], actor);
    const created = await insertVariant(client, productId, data, actor);
    await audit({
      actor,
      action: 'variant.create',
      entity: 'variant',
      entityId: created.id,
      data: { product_id: productId, ...auditData(data) },
      db: client,
    });
    return (await loadAdminVariants(client, { variantId: created.id }))[0];
  });

/**
 * Partial variant update. Pricing rules are checked against the merged
 * state; `attributes`, when given, replaces the whole set.
 */
// Price fields. Staff (branch admins included) may change all of them, the
// cost price too (owner's decision, 2026-10-03); every change is audited as
// variant.update with before/after and shows in the price history.
const PRICE_FIELDS = ['price', 'compare_at_price', 'cost_price', 'sale_price', 'sale_starts_at', 'sale_ends_at'];

const sameValue = (a, b) => {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (a instanceof Date || b instanceof Date || /^\d{4}-\d{2}-\d{2}T/.test(String(a))) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return Number(a) === Number(b);
};

const updateVariant = async (variantId, data, actor) =>
  writeTx(async (client, touch) => {
    const { rows } = await client.query(
      `SELECT pv.*, p.slug AS product_slug FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1 AND p.deleted_at IS NULL
        FOR UPDATE OF pv`,
      [variantId]
    );
    const current = rows[0];
    if (!current) throw ApiError.notFound('Variant not found');
    touch(current.product_slug);


    pricingOrThrow({ ...current, ...data });
    if (data.sku !== undefined && data.sku !== current.sku) await assertSkusFree(client, [data.sku], variantId);

    const values = [];
    const { sets } = buildUpdate(data, VARIANT_COLUMNS, values);
    if (sets.length) {
      values.push(variantId);
      await client.query(`UPDATE product_variants SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    if (data.attributes !== undefined) await replaceAttributes(client, variantId, data.attributes);

    // Record before/after for every changed column (price changes matter).
    const before = Object.fromEntries(VARIANT_COLUMNS.filter((c) => data[c] !== undefined).map((c) => [c, current[c]]));
    await audit({
      actor,
      action: 'variant.update',
      entity: 'variant',
      entityId: variantId,
      data: { product_id: current.product_id, before, after: auditData(data) },
      db: client,
    });
    return (await loadAdminVariants(client, { variantId }))[0];
  });

/**
 * Delete a variant. Variants that appear on orders, or that still have
 * stock / serial units, are deactivated instead so history stays intact.
 * @returns {{ id: string, deleted: boolean, deactivated: boolean, reason?: string }}
 */
const removeVariant = async (variantId, actor) =>
  writeTx(async (client, touch) => {
    const { rows } = await client.query(
      `SELECT pv.id, pv.product_id, pv.sku, p.slug AS product_slug
         FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1 FOR UPDATE OF pv`,
      [variantId]
    );
    const variant = rows[0];
    if (!variant) throw ApiError.notFound('Variant not found');
    touch(variant.product_slug);

    const { rows: [use] } = await client.query(
      `SELECT EXISTS (SELECT 1 FROM order_items     WHERE variant_id = $1) AS ordered,
              EXISTS (SELECT 1 FROM inventory       WHERE variant_id = $1 AND quantity > 0) AS stocked,
              EXISTS (SELECT 1 FROM inventory_units WHERE variant_id = $1) AS units`,
      [variantId]
    );
    const reason = use.ordered ? 'referenced_by_orders' : use.stocked || use.units ? 'has_stock' : null;

    if (reason) {
      await client.query('UPDATE product_variants SET is_active = FALSE WHERE id = $1', [variantId]);
      await audit({ actor, action: 'variant.deactivate', entity: 'variant', entityId: variantId, data: { sku: variant.sku, reason }, db: client });
      return { id: variantId, deleted: false, deactivated: true, reason };
    }
    await client.query('DELETE FROM product_variants WHERE id = $1', [variantId]);
    await audit({ actor, action: 'variant.delete', entity: 'variant', entityId: variantId, data: { sku: variant.sku, product_id: variant.product_id }, db: client });
    return { id: variantId, deleted: true, deactivated: false };
  });

// ─── Specifications & key features ──────────────────────────────────────────

/**
 * Append one specification (sort_order defaults to the end of the list).
 * A field_key already used by this product is a 409.
 */
const addSpecification = async (productId, data, actor) =>
  writeTx(async (client, touch) => {
    const product = await lockProduct(client, productId);
    touch(product.slug);
    const [spec] = applyTemplate([data], await templateOf(client, product.category_id));
    const { rows } = await client.query(
      `INSERT INTO product_specifications
         (product_id, spec_key, spec_value, group_name, field_key, is_highlight, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::int,
         (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_specifications WHERE product_id = $1)))
       RETURNING ${SPEC_COLUMNS}`,
      [productId, spec.spec_key, spec.spec_value, spec.group_name, spec.field_key, spec.is_highlight, data.sort_order ?? null]
    );
    await audit({ actor, action: 'product.spec_add', entity: 'product', entityId: productId, data: { spec_key: data.spec_key }, db: client });
    return rows[0];
  });

/** Replace the whole ordered specification list. */
const replaceSpecifications = async (productId, { specifications }, actor) =>
  writeTx(async (client, touch) => {
    const product = await lockProduct(client, productId);
    touch(product.slug);
    await replaceSpecs(client, productId, specifications, await templateOf(client, product.category_id));
    await audit({ actor, action: 'product.specs_replace', entity: 'product', entityId: productId, data: { count: specifications.length }, db: client });
    return (await loadSpecs(client, productId)).rows;
  });

/** Delete one specification; it must belong to the product in the path. */
const removeSpecification = async (productId, specId, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const { rowCount } = await client.query(
      'DELETE FROM product_specifications WHERE id = $1 AND product_id = $2',
      [specId, productId]
    );
    if (!rowCount) throw ApiError.notFound('Specification not found');
    await audit({ actor, action: 'product.spec_delete', entity: 'product', entityId: productId, data: { spec_id: specId }, db: client });
  });

/** Append one key feature. */
const addKeyFeature = async (productId, data, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const { rows } = await client.query(
      `INSERT INTO product_key_features (product_id, feature, sort_order)
       VALUES ($1, $2, COALESCE($3::int,
         (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_key_features WHERE product_id = $1)))
       RETURNING id, feature, sort_order`,
      [productId, data.feature, data.sort_order ?? null]
    );
    await audit({ actor, action: 'product.feature_add', entity: 'product', entityId: productId, db: client });
    return rows[0];
  });

/** Replace the whole ordered key-feature list. */
const replaceKeyFeatures = async (productId, { key_features }, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    await replaceFeatures(client, productId, key_features);
    await audit({ actor, action: 'product.features_replace', entity: 'product', entityId: productId, data: { count: key_features.length }, db: client });
    return (await client.query(
      'SELECT id, feature, sort_order FROM product_key_features WHERE product_id = $1 ORDER BY sort_order, id',
      [productId]
    )).rows;
  });

/** Delete one key feature; it must belong to the product in the path. */
const removeKeyFeature = async (productId, featureId, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const { rowCount } = await client.query(
      'DELETE FROM product_key_features WHERE id = $1 AND product_id = $2',
      [featureId, productId]
    );
    if (!rowCount) throw ApiError.notFound('Key feature not found');
    await audit({ actor, action: 'product.feature_delete', entity: 'product', entityId: productId, data: { feature_id: featureId }, db: client });
  });

// ─── Images ─────────────────────────────────────────────────────────────────

/** Attach an image (uploaded media or an external URL) to a product. */
const addImage = async (productId, data, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    if (data.variant_id) await assertVariantOfProduct(client, data.variant_id, productId);
    const image = await insertImage(client, productId, { ...data, image_url: await resolveImageUrl(client, data) });
    await audit({ actor, action: 'product.image_add', entity: 'product', entityId: productId, data: { image_id: image.id, url: image.image_url }, db: client });
    return image;
  });

/** Set image order; the list must name every image of the product exactly once. */
const reorderImages = async (productId, imageIds, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const existing = await loadImages(client, productId);
    const known = new Set(existing.map((i) => i.id));
    const unique = new Set(imageIds);
    if (unique.size !== imageIds.length || unique.size !== known.size || imageIds.some((id) => !known.has(id))) {
      throw ApiError.badRequest('Image order must list every image of this product exactly once');
    }
    await client.query(
      `UPDATE product_images pi SET sort_order = (t.ord - 1)::int
         FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, ord)
        WHERE pi.id = t.id AND pi.product_id = $2`,
      [imageIds, productId]
    );
    await audit({ actor, action: 'product.images_reorder', entity: 'product', entityId: productId, data: { order: imageIds }, db: client });
    return loadImages(client, productId);
  });

/**
 * Update alt text / variant link / primary flag. Making an image primary
 * demotes the old one; un-setting the primary promotes the next image.
 * @returns {Promise<object[]>} the product's images after the change
 */
const updateImage = async (productId, imageId, data, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const { rows } = await client.query('SELECT * FROM product_images WHERE id = $1 AND product_id = $2', [imageId, productId]);
    const image = rows[0];
    if (!image) throw ApiError.notFound('Image not found');
    if (data.variant_id) await assertVariantOfProduct(client, data.variant_id, productId);

    const values = [];
    const { sets } = buildUpdate(data, ['alt_text', 'variant_id'], values);
    if (sets.length) {
      values.push(imageId);
      await client.query(`UPDATE product_images SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }

    if (data.is_primary === true && !image.is_primary) {
      await client.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND is_primary', [productId]);
      await client.query('UPDATE product_images SET is_primary = TRUE WHERE id = $1', [imageId]);
    } else if (data.is_primary === false && image.is_primary) {
      const next = await client.query(
        `SELECT id FROM product_images WHERE product_id = $1 AND id <> $2
          ORDER BY sort_order, created_at, id LIMIT 1`,
        [productId, imageId]
      );
      if (!next.rows[0]) throw ApiError.badRequest("A product's only image must stay primary");
      await client.query('UPDATE product_images SET is_primary = FALSE WHERE id = $1', [imageId]);
      await client.query('UPDATE product_images SET is_primary = TRUE WHERE id = $1', [next.rows[0].id]);
    }

    await audit({ actor, action: 'product.image_update', entity: 'product', entityId: productId, data: { image_id: imageId, ...data }, db: client });
    return loadImages(client, productId);
  });

/**
 * Detach an image from a product (the uploaded file itself is managed via
 * /uploads). Deleting the primary promotes the next image.
 * @returns {Promise<object[]>} the remaining images
 */
const removeImage = async (productId, imageId, actor) =>
  writeTx(async (client, touch) => {
    touch((await lockProduct(client, productId)).slug);
    const { rows } = await client.query(
      'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING image_url, is_primary',
      [imageId, productId]
    );
    if (!rows[0]) throw ApiError.notFound('Image not found');
    if (rows[0].is_primary) await ensurePrimary(client, productId);
    await audit({ actor, action: 'product.image_delete', entity: 'product', entityId: productId, data: { image_id: imageId, url: rows[0].image_url }, db: client });
    return loadImages(client, productId);
  });

module.exports = {
  PUBLIC_COLUMNS, PUBLIC_FROM, PUBLIC_SORTS, EFFECTIVE, decoratePublic,
  getAll, getFeatured, search, getBySlug, getVariants, getSitemap,
  getAdminList, getAdminById, getPriceHistory,
  create, update, remove,
  createVariant, updateVariant, removeVariant,
  addSpecification, replaceSpecifications, removeSpecification,
  addKeyFeature, replaceKeyFeatures, removeKeyFeature,
  addImage, reorderImages, updateImage, removeImage,
};
