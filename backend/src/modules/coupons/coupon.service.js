const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { paginatedResponse } = require('../../utils/pagination');
const { effectivePriceSql } = require('../../utils/pricing');
const { escapeLike } = require('../../utils/validators');
const { audit } = require('../../utils/audit');
const { checkCoupon } = require('./coupon.apply');
const { fullCouponSchema } = require('./coupon.validation');

/**
 * Coupon administration (super_admin writes, staff reads) and the customer's
 * cart check. The redemption rules themselves live in coupon.apply.js, shared
 * with checkout and POS.
 */

// Writable columns (fixed allowlist → safe to interpolate).
const COLUMNS = [
  'code', 'description', 'discount_type', 'discount_value', 'min_order_value', 'max_uses',
  'max_discount', 'per_user_limit', 'channel', 'valid_from', 'valid_until', 'is_active',
];

const SELECT = `
  SELECT c.*,
         (SELECT COUNT(*)::int FROM coupon_redemptions r
           WHERE r.coupon_id = c.id AND r.released_at IS NULL) AS redemption_count
    FROM coupons c`;

const STATUS_FILTERS = {
  active: 'c.is_active = TRUE AND c.valid_from <= NOW() AND c.valid_until >= NOW()',
  expired: 'c.valid_until < NOW()',
  inactive: 'c.is_active = FALSE',
  scheduled: 'c.valid_from > NOW()',
};


const toPaisa = (v) => Math.round(Number(v) * 100);

const assertCodeFree = async (db, code, exceptId = null) => {
  const { rowCount } = await db.query(
    'SELECT 1 FROM coupons WHERE LOWER(code) = LOWER($1) AND ($2::uuid IS NULL OR id <> $2)',
    [code, exceptId]
  );
  if (rowCount) throw ApiError.conflict('A coupon with this code already exists');
};

/** Paginated coupon list with filters (status, channel, q). */
const getAll = async (q) => {
  const page = q.page || 1;
  const limit = q.limit || 20;
  const where = [];
  const params = [];
  if (q.status) where.push(STATUS_FILTERS[q.status]);
  if (q.channel) {
    params.push(q.channel);
    where.push(`c.channel = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${escapeLike(q.q)}%`);
    where.push(`(c.code ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(
      `${SELECT} ${whereSql} ORDER BY c.created_at DESC, c.code
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    ),
    query(`SELECT COUNT(*)::int AS n FROM coupons c ${whereSql}`, params),
  ]);
  return paginatedResponse(list.rows, count.rows[0].n, { page, limit });
};

const getById = async (id) => {
  const { rows } = await query(`${SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Coupon not found');
  return rows[0];
};

/** Create a coupon (validated body). */
const create = async (data, actor) => {
  const created = await withTransaction(async (client) => {
    await assertCodeFree(client, data.code);
    const cols = COLUMNS.filter((c) => data[c] !== undefined);
    const { rows } = await client.query(
      `INSERT INTO coupons (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      cols.map((c) => data[c])
    );
    await audit({ actor, action: 'coupon.create', entity: 'coupon', entityId: rows[0].id, data: { code: data.code }, db: client });
    return rows[0];
  });
  return getById(created.id);
};

/**
 * Partial update. The merged result is re-checked against the cross-field
 * rules (percentage range, date order).
 */
const update = async (id, patch, actor) => {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM coupons WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw ApiError.notFound('Coupon not found');
    fullCouponSchema.parse({ ...rows[0], ...patch });
    if (patch.code) await assertCodeFree(client, patch.code, id);

    const cols = COLUMNS.filter((c) => patch[c] !== undefined);
    await client.query(
      `UPDATE coupons SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [id, ...cols.map((c) => patch[c])]
    );
    await audit({ actor, action: 'coupon.update', entity: 'coupon', entityId: id, data: patch, db: client });
  });
  return getById(id);
};

/**
 * Delete a never-used coupon; a coupon with redemptions/orders is kept for
 * the record and deactivated instead.
 *
 * @returns {Promise<{ deleted: boolean, deactivated: boolean }>}
 */
const remove = async (id, actor) =>
  withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, code FROM coupons WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw ApiError.notFound('Coupon not found');
    const used = await client.query(
      `SELECT EXISTS (SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1)
           OR EXISTS (SELECT 1 FROM orders WHERE coupon_id = $1) AS used`,
      [id]
    );
    if (used.rows[0].used) {
      await client.query('UPDATE coupons SET is_active = FALSE WHERE id = $1', [id]);
      await audit({ actor, action: 'coupon.deactivate', entity: 'coupon', entityId: id, data: { code: rows[0].code }, db: client });
      return { deleted: false, deactivated: true };
    }
    await client.query('DELETE FROM coupons WHERE id = $1', [id]);
    await audit({ actor, action: 'coupon.delete', entity: 'coupon', entityId: id, data: { code: rows[0].code }, db: client });
    return { deleted: true, deactivated: false };
  });

/**
 * Customer cart check: price the cart server-side (effective prices) and test
 * the code without reserving a use.
 *
 * @returns {Promise<{ code: string, discount: number, subtotal: number, total_before_shipping: number }>}
 */
const validateForCart = async ({ code, items }, user) => {
  const { rows } = await query(
    `SELECT pv.id, ${effectivePriceSql('pv')} AS price
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ANY($1::uuid[]) AND pv.is_active = TRUE AND p.is_active = TRUE AND p.deleted_at IS NULL`,
    [items.map((i) => i.variant_id)]
  );
  if (rows.length !== items.length) throw ApiError.badRequest('Some items in your cart are no longer available');
  const price = Object.fromEntries(rows.map((r) => [r.id, toPaisa(r.price)]));
  const subtotalP = items.reduce((sum, i) => sum + price[i.variant_id] * i.quantity, 0);

  // Same customer-facing reasons as checkout (minimum order, already used,
  // expired…), so the preview never disagrees with the order. Unknown and
  // inactive codes share one message; the endpoint is rate-limited.
  const result = await checkCoupon({ query }, { code, subtotal: subtotalP / 100, userId: user.id, channel: 'online' });
  const discountP = Math.min(toPaisa(result.discount), subtotalP);
  return {
    code: result.coupon.code,
    discount: discountP / 100,
    subtotal: subtotalP / 100,
    total_before_shipping: (subtotalP - discountP) / 100,
  };
};

module.exports = { getAll, getById, create, update, remove, validateForCart };
