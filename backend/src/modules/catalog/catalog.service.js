const { query, withTransaction } = require('../../config/database');
const { escapeLike } = require('../../utils/validators');
const { effectivePriceSql, compareAtPriceSql } = require('../../utils/pricing');
const products = require('../products/product.service');

/**
 * Storefront navigation data: search-as-you-type suggestions and the
 * category mega-menu.
 */

const SUGGEST_PRODUCTS = 6;
const SUGGEST_CATEGORIES = 4;
const SUGGEST_BRANDS = 4;
const MENU_BRANDS = 8;
const MENU_PRODUCTS = 3;

// Product condition enum order, with human labels for the storefront.
const CONDITION_ORDER = ['new', 'used', 'refurbished', 'open_box'];
const CONDITION_LABELS = { new: 'New', used: 'Used', refurbished: 'Refurbished', open_box: 'Open Box' };

/**
 * Suggestions for a typed term: products (same trigram match as
 * /products/search), plus matching categories and brands. `total` is the
 * full product match count.
 * @param {string} q - trimmed, 2..80 chars
 */
const suggest = async (q) => {
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const match = '($1 <% p.name OR p.name ILIKE $2 OR b.name ILIKE $2 OR p.short_description ILIKE $2)';

  return withTransaction(async (client) => {
    // Same lowered threshold as the full search; scoped to this transaction.
    await client.query('SET LOCAL pg_trgm.word_similarity_threshold = 0.3');
    const prod = await client.query(
      `SELECT p.id, p.name, p.slug, cv.price, cv.compare_at_price,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id
                ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC LIMIT 1) AS image,
              EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                       WHERE v.product_id = p.id AND v.is_active AND i.quantity - i.reserved > 0) AS in_stock
         ${products.PUBLIC_FROM} AND ${match}
        ORDER BY word_similarity($1, p.name) DESC, p.name ASC, p.id
        LIMIT ${SUGGEST_PRODUCTS}`,
      [q, like]
    );
    const total = await client.query(
      `SELECT COUNT(*)::int AS n ${products.PUBLIC_FROM} AND ${match}`,
      [q, like]
    );
    const categories = await client.query(
      `SELECT name, slug FROM categories
        WHERE is_active AND ($1 <% name OR name ILIKE $2)
        ORDER BY (name ILIKE $3) DESC, word_similarity($1, name) DESC, name
        LIMIT ${SUGGEST_CATEGORIES}`,
      [q, like, prefix]
    );
    const brands = await client.query(
      `SELECT name, slug, logo_url FROM brands
        WHERE is_active AND ($1 <% name OR name ILIKE $2)
        ORDER BY (name ILIKE $3) DESC, word_similarity($1, name) DESC, name
        LIMIT ${SUGGEST_BRANDS}`,
      [q, like, prefix]
    );
    return {
      products: prod.rows,
      categories: categories.rows,
      brands: brands.rows,
      total: total.rows[0].n,
    };
  });
};

/**
 * Menu data: active top-level categories with their active children, the
 * brands (≤ 8, most products first) that have public products anywhere in
 * the category's subtree, the conditions on offer, and up to 3 popular
 * products (in stock first, then featured, then newest) for the menu's
 * "Popular in …" column.
 */
const getMenu = async () => {
  const [cats, kids, brands, conds, picks] = await Promise.all([
    query(
      `SELECT id, name, slug, COALESCE(icon_url, banner_url) AS image_url
         FROM categories WHERE is_active AND parent_id IS NULL
        ORDER BY sort_order, name, id`
    ),
    query(
      `SELECT parent_id, name, slug FROM categories
        WHERE is_active AND parent_id IS NOT NULL
        ORDER BY sort_order, name, id`
    ),
    query(
      `WITH RECURSIVE tree(root_id, id) AS (
         SELECT id, id FROM categories WHERE is_active AND parent_id IS NULL
         UNION
         SELECT t.root_id, c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.is_active
       )
       SELECT r.root_id, r.name, r.slug, r.logo_url
         FROM (SELECT t.root_id, b.name, b.slug, b.logo_url,
                      ROW_NUMBER() OVER (PARTITION BY t.root_id ORDER BY COUNT(*) DESC, b.name, b.id) AS n
                 FROM tree t
                 JOIN products p ON p.category_id = t.id AND p.is_active AND p.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active)
                 JOIN brands b ON b.id = p.brand_id AND b.is_active
                GROUP BY t.root_id, b.id) r
        WHERE r.n <= $1
        ORDER BY r.root_id, r.n`,
      [MENU_BRANDS]
    ),
    query(
      `WITH RECURSIVE tree(root_id, id) AS (
         SELECT id, id FROM categories WHERE is_active AND parent_id IS NULL
         UNION
         SELECT t.root_id, c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.is_active
       )
       SELECT t.root_id, p.condition::text AS code, COUNT(*)::int AS count
         FROM tree t
         JOIN products p ON p.category_id = t.id AND p.is_active AND p.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active)
        GROUP BY t.root_id, p.condition`
    ),
    query(
      `WITH RECURSIVE tree(root_id, id) AS (
         SELECT id, id FROM categories WHERE is_active AND parent_id IS NULL
         UNION
         SELECT t.root_id, c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.is_active
       )
       SELECT root_id, name, slug, image, price, compare_at_price, in_stock
         FROM (SELECT t.root_id, p.name, p.slug, v.price, v.compare_at_price, v.in_stock,
                      (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id
                        ORDER BY pi.is_primary DESC, pi.sort_order, pi.created_at LIMIT 1) AS image,
                      ROW_NUMBER() OVER (PARTITION BY t.root_id
                        ORDER BY v.in_stock DESC, p.is_featured DESC, p.sort_order, p.created_at DESC, p.id) AS n
                 FROM tree t
                 JOIN products p ON p.category_id = t.id AND p.is_active AND p.deleted_at IS NULL
                 JOIN LATERAL (
                   SELECT ${effectivePriceSql('pv')} AS price, ${compareAtPriceSql('pv')} AS compare_at_price,
                          EXISTS (SELECT 1 FROM inventory i
                                   WHERE i.variant_id = pv.id AND i.quantity - i.reserved > 0) AS in_stock
                     FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active
                    ORDER BY 3 DESC, 1 ASC LIMIT 1
                 ) v ON TRUE) r
        WHERE r.n <= $1
        ORDER BY r.root_id, r.n`,
      [MENU_PRODUCTS]
    ),
  ]);

  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      const { [key]: k, ...rest } = r;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(rest);
    }
    return m;
  };
  const children = group(kids.rows, 'parent_id');
  const brandMap = group(brands.rows, 'root_id');
  const condMap = group(conds.rows, 'root_id');
  const pickMap = group(picks.rows, 'root_id');
  const conditionsOf = (id) =>
    (condMap.get(id) || [])
      .sort((a, b) => CONDITION_ORDER.indexOf(a.code) - CONDITION_ORDER.indexOf(b.code))
      .map((r) => ({ code: r.code, label: CONDITION_LABELS[r.code] || r.code, count: r.count }));
  return {
    categories: cats.rows.map((c) => ({
      ...c,
      children: children.get(c.id) || [],
      brands: brandMap.get(c.id) || [],
      conditions: conditionsOf(c.id),
      products: pickMap.get(c.id) || [],
    })),
  };
};

module.exports = { suggest, getMenu };
