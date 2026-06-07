const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');

/**
 * wishlists service — user-scoped favourites.
 * A wishlist row is unique per (user_id, product_id).
 */

/**
 * Get the authenticated user's wishlist, joined with product display fields.
 */
const getMine = async (user) => {
  const result = await query(
    `SELECT
       w.id,
       w.product_id,
       w.created_at,
       p.name,
       p.slug,
       p.short_description,
       CASE p.condition WHEN 'new' THEN 'New' ELSE 'Pre-Owned' END AS condition,
       b.name AS brand,
       MIN(pv.price) AS price,
       (
         SELECT pi.image_url FROM product_images pi
         WHERE pi.product_id = p.id AND pi.is_primary = TRUE
         LIMIT 1
       ) AS image
     FROM wishlists w
     JOIN products p          ON p.id = w.product_id
     LEFT JOIN brands b       ON b.id = p.brand_id
     LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
     WHERE w.user_id = $1 AND p.deleted_at IS NULL
     GROUP BY w.id, p.id, b.name
     ORDER BY w.created_at DESC`,
    [user.id]
  );
  return result.rows;
};

/**
 * Add a product to the user's wishlist (idempotent).
 */
const add = async (user, productId) => {
  const prod = await query(
    'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE',
    [productId]
  );
  if (!prod.rows.length) {
    throw ApiError.notFound('Product not found');
  }

  const result = await query(
    `INSERT INTO wishlists (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING id, product_id, created_at`,
    [user.id, productId]
  );

  // If it already existed, ON CONFLICT returns no row — fetch the existing one.
  if (!result.rows.length) {
    const existing = await query(
      'SELECT id, product_id, created_at FROM wishlists WHERE user_id = $1 AND product_id = $2',
      [user.id, productId]
    );
    return existing.rows[0];
  }
  return result.rows[0];
};

/**
 * Remove a product from the user's wishlist.
 */
const remove = async (user, productId) => {
  await query('DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2', [
    user.id,
    productId,
  ]);
};

module.exports = { getMine, add, remove };
