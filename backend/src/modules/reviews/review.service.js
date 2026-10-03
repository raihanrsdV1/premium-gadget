const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { escapeLike } = require('../../utils/validators');
const { audit } = require('../../utils/audit');

/**
 * Product reviews. Customers write them (one per product), staff moderate
 * them; the storefront only ever sees approved reviews with the reviewer's
 * first name. Any edit sends a review back to moderation.
 */

const NOT_FOUND = 'Review not found';

// Orders in these states mean the customer actually bought the product.
const PURCHASED_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

const OWN_FIELDS = `r.id, r.product_id, r.rating, r.title, r.body, r.is_approved, r.verified_purchase,
  r.created_at, r.updated_at`;

const assertActiveProduct = async (productId) => {
  const { rows } = await query(
    'SELECT 1 FROM products WHERE id = $1 AND is_active AND deleted_at IS NULL', [productId]
  );
  if (!rows.length) throw ApiError.notFound('Product not found');
};

/** Has this user an order (in a purchased state) containing any variant of the product? */
const isVerifiedPurchase = async (userId, productId) => {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE o.user_id = $1 AND pv.product_id = $2 AND o.status = ANY($3::order_status[])
     ) AS verified`,
    [userId, productId, PURCHASED_STATUSES]
  );
  return rows[0].verified;
};

/**
 * Public: approved reviews of an active product, newest first, plus a
 * rating summary over all approved reviews.
 */
const listPublic = async (q) => {
  const { page, limit, offset } = parsePagination(q);
  await assertActiveProduct(q.product_id);

  const base = `FROM reviews r JOIN users u ON u.id = r.user_id
                WHERE r.product_id = $1 AND r.is_approved AND u.deleted_at IS NULL`;
  const [rows, summary] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.title, r.body, r.verified_purchase, r.created_at, r.updated_at,
              split_part(btrim(u.full_name), ' ', 1) AS reviewer_name
         ${base}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $2 OFFSET $3`,
      [q.product_id, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::float8 AS average,
              COUNT(*) FILTER (WHERE r.rating = 1)::int AS r1,
              COUNT(*) FILTER (WHERE r.rating = 2)::int AS r2,
              COUNT(*) FILTER (WHERE r.rating = 3)::int AS r3,
              COUNT(*) FILTER (WHERE r.rating = 4)::int AS r4,
              COUNT(*) FILTER (WHERE r.rating = 5)::int AS r5
         ${base}`,
      [q.product_id]
    ),
  ]);
  const s = summary.rows[0];
  return {
    ...paginatedResponse(rows.rows, s.count, { page, limit }),
    summary: {
      average: s.average,
      count: s.count,
      distribution: { 1: s.r1, 2: s.r2, 3: s.r3, 4: s.r4, 5: s.r5 },
    },
  };
};

/** The caller's own reviews (any moderation state), optionally for one product. */
const listMine = async (q, user) => {
  const params = [user.id];
  let filter = '';
  if (q.product_id) {
    params.push(q.product_id);
    filter = 'AND r.product_id = $2';
  }
  const { rows } = await query(
    `SELECT ${OWN_FIELDS}, p.name AS product_name, p.slug AS product_slug
       FROM reviews r JOIN products p ON p.id = r.product_id
      WHERE r.user_id = $1 ${filter}
      ORDER BY r.created_at DESC`,
    params
  );
  return rows;
};

/** Write a review (one per user per product). It waits for moderation. */
const create = async (data, user) => {
  await assertActiveProduct(data.product_id);
  const existing = await query('SELECT 1 FROM reviews WHERE user_id = $1 AND product_id = $2', [user.id, data.product_id]);
  if (existing.rows.length) throw ApiError.conflict('You have already reviewed this product — edit your review instead');

  const verified = await isVerifiedPurchase(user.id, data.product_id);
  const { rows } = await query(
    `INSERT INTO reviews (product_id, user_id, rating, title, body, is_approved, verified_purchase)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6)
     RETURNING id, product_id, rating, title, body, is_approved, verified_purchase, created_at, updated_at`,
    [data.product_id, user.id, data.rating, data.title || null, data.body || null, verified]
  );
  return rows[0];
};

const loadReview = async (id) => {
  const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [id]);
  if (!rows.length) throw ApiError.notFound(NOT_FOUND);
  return rows[0];
};

/** Owner edit. Resets approval (and re-checks verified purchase). */
const update = async (id, data, user) => {
  const review = await loadReview(id);
  if (review.user_id !== user.id) throw ApiError.forbidden('You can only edit your own review');

  const verified = await isVerifiedPurchase(user.id, review.product_id);
  const { rows } = await query(
    `UPDATE reviews
        SET rating = COALESCE($1, rating),
            title = CASE WHEN $2::boolean THEN $3 ELSE title END,
            body  = CASE WHEN $4::boolean THEN $5 ELSE body END,
            verified_purchase = $6,
            is_approved = FALSE, moderated_by = NULL, moderated_at = NULL
      WHERE id = $7
      RETURNING id, product_id, rating, title, body, is_approved, verified_purchase, created_at, updated_at`,
    [
      data.rating ?? null,
      data.title !== undefined, data.title || null,
      data.body !== undefined, data.body || null,
      verified, id,
    ]
  );
  return rows[0];
};

/** Delete: the author, or a super_admin (audited). */
const remove = async (id, user) => {
  const review = await loadReview(id);
  const isOwner = review.user_id === user.id;
  if (!isOwner && user.role !== 'super_admin') throw ApiError.forbidden('You can only delete your own review');
  await query('DELETE FROM reviews WHERE id = $1', [id]);
  if (!isOwner) {
    await audit({
      actor: user, action: 'review.delete', entity: 'review', entityId: id,
      data: { product_id: review.product_id, user_id: review.user_id, rating: review.rating },
    });
  }
};

/** Staff moderation queue / search. Includes the reviewer's phone. */
const listAdmin = async (q) => {
  const { page, limit, offset } = parsePagination(q);
  const where = ['TRUE'];
  const params = [];
  if (q.status === 'pending') where.push('NOT r.is_approved');
  if (q.status === 'approved') where.push('r.is_approved');
  if (q.product_id) {
    params.push(q.product_id);
    where.push(`r.product_id = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${escapeLike(q.q)}%`);
    const n = params.length;
    where.push(`(r.title ILIKE $${n} OR r.body ILIKE $${n} OR u.full_name ILIKE $${n} OR u.phone ILIKE $${n} OR p.name ILIKE $${n})`);
  }
  const whereSql = where.join(' AND ');
  const from = `FROM reviews r
    JOIN users u ON u.id = r.user_id
    JOIN products p ON p.id = r.product_id
    LEFT JOIN users m ON m.id = r.moderated_by`;
  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n ${from} WHERE ${whereSql}`, params),
    query(
      `SELECT ${OWN_FIELDS}, p.name AS product_name, p.slug AS product_slug,
              r.user_id, u.full_name AS reviewer_name, u.phone AS reviewer_phone,
              r.moderated_by, m.full_name AS moderated_by_name, r.moderated_at
         ${from} WHERE ${whereSql}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/** Approve or hide a review (staff). */
const moderate = async (id, { is_approved: isApproved }, user) => {
  const { rows } = await query(
    `UPDATE reviews SET is_approved = $1, moderated_by = $2, moderated_at = NOW()
      WHERE id = $3
      RETURNING id, product_id, rating, title, body, is_approved, verified_purchase,
                moderated_by, moderated_at, created_at, updated_at`,
    [isApproved, user.id, id]
  );
  if (!rows.length) throw ApiError.notFound(NOT_FOUND);
  await audit({ actor: user, action: 'review.moderate', entity: 'review', entityId: id, data: { is_approved: isApproved } });
  return rows[0];
};

module.exports = { listPublic, listMine, create, update, remove, listAdmin, moderate };
