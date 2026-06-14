const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

// ─── Shared base SELECT for list views ──────────────────────────────────────
const PRODUCT_LIST_SELECT = `
  SELECT
    p.id,
    p.name,
    p.slug,
    p.short_description,
    p.is_featured,
    CASE p.condition WHEN 'new' THEN 'New' ELSE 'Pre-Owned' END AS condition,
    b.name   AS brand,
    b.slug   AS brand_slug,
    MIN(pv.price)            AS price,
    MIN(pv.compare_at_price) AS compare_at_price,
    (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id AND pi.is_primary = TRUE
      LIMIT 1
    ) AS image
  FROM products p
  LEFT JOIN brands b            ON b.id = p.brand_id
  LEFT JOIN categories c        ON c.id = p.category_id
  LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
  WHERE p.is_active = TRUE AND p.deleted_at IS NULL
`;

const getAll = async (queryParams) => {
  const { page, limit, offset } = parsePagination(queryParams);
  const { category, brand, condition } = queryParams;

  const params = [];
  const extraFilters = [];

  if (category) {
    // Match the category itself OR any of its direct child categories, so a
    // parent like "laptops" returns products filed under "macbooks" /
    // "windows-laptops". (One level deep, which covers the current taxonomy.)
    params.push(category);
    const n = params.length;
    extraFilters.push(
      `(c.slug = $${n} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${n}))`
    );
  }
  if (brand) {
    params.push(brand);
    extraFilters.push(`b.slug = $${params.length}`);
  }
  if (condition) {
    const dbVal = condition === 'new' ? 'new' : 'used';
    params.push(dbVal);
    extraFilters.push(`p.condition = $${params.length}`);
  }

  const filterClause = extraFilters.length ? `AND ${extraFilters.join(' AND ')}` : '';

  const dataSql = `
    ${PRODUCT_LIST_SELECT} ${filterClause}
    GROUP BY p.id, p.name, p.slug, p.short_description, p.is_featured, p.condition, b.name, b.slug
    ORDER BY p.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const countSql = `
    SELECT COUNT(DISTINCT p.id)
    FROM products p
    LEFT JOIN brands b     ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = TRUE AND p.deleted_at IS NULL ${filterClause}
  `;

  const [data, count] = await Promise.all([
    query(dataSql, [...params, limit, offset]),
    query(countSql, params),
  ]);

  return paginatedResponse(data.rows, parseInt(count.rows[0].count, 10), { page, limit });
};

const getFeatured = async () => {
  const sql = `
    ${PRODUCT_LIST_SELECT} AND p.is_featured = TRUE
    GROUP BY p.id, p.name, p.slug, p.short_description, p.is_featured, p.condition, b.name, b.slug
    ORDER BY p.created_at DESC
    LIMIT 8
  `;
  const result = await query(sql);
  return result.rows;
};

const search = async (queryParams) => {
  const { page, limit, offset } = parsePagination(queryParams);
  const { q } = queryParams;

  if (!q || q.trim().length < 2) {
    return paginatedResponse([], 0, { page, limit });
  }

  // $1 = raw term (trigram word-similarity, typo-tolerant, uses the
  //      idx_products_name_trgm GIN index via the <% operator)
  // $2 = %term% (substring ILIKE fallback for brand / short_description and
  //      very short queries below the trigram threshold)
  const term = q.trim();
  const like = `%${term}%`;
  const matchClause = `($1 <% p.name OR p.name ILIKE $2 OR b.name ILIKE $2 OR p.short_description ILIKE $2)`;

  const dataSql = `
    ${PRODUCT_LIST_SELECT}
      AND ${matchClause}
    GROUP BY p.id, p.name, p.slug, p.short_description, p.is_featured, p.condition, b.name, b.slug
    ORDER BY word_similarity($1, p.name) DESC, p.name ASC
    LIMIT $3 OFFSET $4
  `;
  const countSql = `
    SELECT COUNT(DISTINCT p.id)
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = TRUE AND p.deleted_at IS NULL
      AND ${matchClause}
  `;

  // Lower the trigram word-similarity threshold (default 0.6) so common typos
  // still match. SET LOCAL is scoped to this transaction only, so it never
  // leaks onto a pooled connection.
  const [data, count] = await withTransaction(async (client) => {
    await client.query("SET LOCAL pg_trgm.word_similarity_threshold = 0.3");
    const d = await client.query(dataSql, [term, like, limit, offset]);
    const c = await client.query(countSql, [term, like]);
    return [d, c];
  });

  return paginatedResponse(data.rows, parseInt(count.rows[0].count, 10), { page, limit });
};

const getBySlug = async (slug) => {
  // 1. Core product
  const prodResult = await query(
    `SELECT
       p.*,
       CASE p.condition WHEN 'new' THEN 'New' ELSE 'Pre-Owned' END AS condition_label,
       b.name AS brand, b.slug AS brand_slug,
       c.name AS category, c.slug AS category_slug
     FROM products p
     LEFT JOIN brands     b ON b.id = p.brand_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE`,
    [slug]
  );

  if (!prodResult.rows.length) throw ApiError.notFound('Product not found');
  const product = prodResult.rows[0];

  // 2. Variants (with available stock = SUM(quantity - reserved) across branches)
  const varResult = await query(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.color, pv.price, pv.compare_at_price, pv.is_active,
            COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.variant_id = pv.id), 0)::int AS available
     FROM product_variants pv
     WHERE pv.product_id = $1 AND pv.is_active = TRUE
     ORDER BY pv.price ASC`,
    [product.id]
  );
  const variants = varResult.rows;

  if (variants.length) {
    const ids = variants.map((v) => v.id);
    const attrResult = await query(
      `SELECT variant_id, attribute_key, attribute_value
       FROM variant_attributes WHERE variant_id = ANY($1)
       ORDER BY sort_order ASC`,
      [ids]
    );
    const attrMap = {};
    attrResult.rows.forEach((a) => {
      if (!attrMap[a.variant_id]) attrMap[a.variant_id] = {};
      attrMap[a.variant_id][a.attribute_key] = a.attribute_value;
    });
    variants.forEach((v) => { v.attributes = attrMap[v.id] || {}; });
  }

  // 3. Specs, features, images
  const [specsR, featR, imgR] = await Promise.all([
    query(`SELECT spec_key AS key, spec_value AS value FROM product_specifications WHERE product_id=$1 ORDER BY sort_order`, [product.id]),
    query(`SELECT feature FROM product_key_features WHERE product_id=$1 ORDER BY sort_order`, [product.id]),
    query(`SELECT image_url, alt_text, is_primary FROM product_images WHERE product_id=$1 ORDER BY is_primary DESC, sort_order ASC`, [product.id]),
  ]);

  return {
    ...product,
    variants,
    specifications: specsR.rows,
    key_features: featR.rows.map((r) => r.feature),
    images: imgR.rows.map((r) => r.image_url),
  };
};

const getVariants = async (productId) => {
  const result = await query(
    `SELECT pv.id, pv.sku, pv.variant_name, pv.color, pv.price, pv.compare_at_price,
            COALESCE((SELECT SUM(i.quantity - i.reserved) FROM inventory i WHERE i.variant_id = pv.id), 0)::int AS available
     FROM product_variants pv
     WHERE pv.product_id = $1 AND pv.is_active = TRUE
     ORDER BY pv.price ASC`,
    [productId]
  );
  return result.rows;
};

const create    = async () => { throw ApiError.internal('Not implemented yet'); };
const update    = async () => { throw ApiError.internal('Not implemented yet'); };
const remove    = async () => { throw ApiError.internal('Not implemented yet'); };
const createVariant  = async () => { throw ApiError.internal('Not implemented yet'); };
const updateVariant  = async () => { throw ApiError.internal('Not implemented yet'); };
const removeVariant  = async () => { throw ApiError.internal('Not implemented yet'); };
const addSpecification = async () => { throw ApiError.internal('Not implemented yet'); };
const addKeyFeature    = async () => { throw ApiError.internal('Not implemented yet'); };
const addImage         = async () => { throw ApiError.internal('Not implemented yet'); };

module.exports = {
  getAll, getFeatured, search, getBySlug, getVariants,
  create, update, remove,
  createVariant, updateVariant, removeVariant,
  addSpecification, addKeyFeature, addImage,
};
