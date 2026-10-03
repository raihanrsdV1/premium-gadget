/**
 * Card badges ("Hot", "New", …) for public product rows.
 *
 * A product earns a badge from a LIVE collection that has a badge_label:
 *   - a manual collection that contains it, or
 *   - a `newest` collection when the product was created within its window.
 * At most MAX_BADGES per product, ordered by the collection's home order.
 * Kept free of other module imports so product.service can use it.
 */

const MAX_BADGES = 2;
const DEFAULT_WINDOW_DAYS = 30;

/** "Live" per contract §2.2; `alias` is the collections table alias. */
const liveSql = (alias = 'c') => `(${alias}.is_active
  AND (${alias}.starts_at IS NULL OR ${alias}.starts_at <= NOW())
  AND (${alias}.ends_at IS NULL OR ${alias}.ends_at > NOW()))`;

/**
 * Badges for many products in ONE query.
 *
 * @param {{ query: Function }} db
 * @param {string[]} productIds
 * @returns {Promise<Map<string, Array<{ label: string, tone: string, slug: string }>>>}
 */
const badgesFor = async (db, productIds) => {
  const ids = [...new Set(productIds)];
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const { rows } = await db.query(
    `SELECT x.product_id,
            json_agg(json_build_object('label', x.badge_label, 'tone', x.badge_tone, 'slug', x.slug)
                     ORDER BY x.n) AS badges
       FROM (SELECT p.id AS product_id, c.badge_label, c.badge_tone, c.slug,
                    ROW_NUMBER() OVER (PARTITION BY p.id
                                       ORDER BY c.home_sort_order, c.created_at, c.id) AS n
               FROM products p
              CROSS JOIN collections c
              WHERE p.id = ANY($1::uuid[])
                AND c.badge_label IS NOT NULL
                AND ${liveSql('c')}
                AND ((c.source = 'manual'
                      AND EXISTS (SELECT 1 FROM collection_products cp
                                   WHERE cp.collection_id = c.id AND cp.product_id = p.id))
                  OR (c.source = 'newest'
                      AND p.created_at >= NOW() - make_interval(days => COALESCE(c.source_days, $2))))
            ) x
      WHERE x.n <= $3
      GROUP BY x.product_id`,
    [ids, DEFAULT_WINDOW_DAYS, MAX_BADGES]
  );
  for (const r of rows) map.set(r.product_id, r.badges);
  return map;
};

/** Attach `badges` to product rows (by `id`) in place; returns the rows. */
const withBadges = async (db, rows, idKey = 'id') => {
  const map = await badgesFor(db, rows.map((r) => r[idKey]));
  rows.forEach((r) => {
    r.badges = map.get(r[idKey]) || [];
  });
  return rows;
};

module.exports = { MAX_BADGES, DEFAULT_WINDOW_DAYS, liveSql, badgesFor, withBadges };
