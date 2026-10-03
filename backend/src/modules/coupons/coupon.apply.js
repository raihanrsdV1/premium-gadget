const ApiError = require('../../utils/ApiError');
const { round2 } = require('../../utils/pricing');

/**
 * Shared coupon rules used by online checkout and POS. One implementation so
 * both channels enforce the same validity window, usage caps, per-user limit,
 * channel restriction and max-discount cap.
 *
 * Usage inside a transaction:
 *   const { coupon, discount } = await applyCoupon(client, { code, subtotal, userId, channel: 'online' });
 *   ...insert order...
 *   await recordRedemption(client, { couponId: coupon.id, userId, orderId, discount });
 * On cancel/expiry:
 *   await releaseCouponForOrder(client, orderId);
 */

const computeDiscount = (coupon, subtotal) => {
  let discount = coupon.discount_type === 'percentage'
    ? round2(subtotal * (Number(coupon.discount_value) / 100))
    : round2(Number(coupon.discount_value));
  if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
    discount = Math.min(discount, Number(coupon.max_discount));
  }
  return round2(Math.max(0, Math.min(discount, subtotal)));
};

/**
 * Validate a coupon against the cart. Throws ApiError.badRequest with a
 * customer-friendly message when it can't be used.
 *
 * @param {{ query: Function }} db
 * @param {{ code: string, subtotal: number, userId?: string|null, channel: 'online'|'pos', lock?: boolean }} opts
 * @returns {Promise<{ coupon: object, discount: number }>}
 */
const checkCoupon = async (db, { code, subtotal, userId = null, channel, lock = false }) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons WHERE LOWER(code) = LOWER($1) ${lock ? 'FOR UPDATE' : ''}`,
    [String(code).trim()]
  );
  const coupon = rows[0];
  if (!coupon || !coupon.is_active) throw ApiError.badRequest('Coupon is invalid or inactive');

  const now = new Date();
  if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_until)) {
    throw ApiError.badRequest('Coupon has expired or is not yet valid');
  }
  // Online customers get the plain "invalid" message for in-store-only codes,
  // so checkout can't be used to discover staff/POS codes.
  if (coupon.channel !== 'all' && coupon.channel !== channel && channel === 'online') {
    throw ApiError.badRequest('Coupon is invalid or inactive');
  }
  if (coupon.channel !== 'all' && coupon.channel !== channel) {
    throw ApiError.badRequest(
      coupon.channel === 'pos' ? 'This coupon is only valid for in-store purchases' : 'This coupon is only valid for online orders'
    );
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    throw ApiError.badRequest('Coupon usage limit reached');
  }
  if (subtotal < Number(coupon.min_order_value || 0)) {
    throw ApiError.badRequest(`Order subtotal must be at least ৳${Number(coupon.min_order_value)} to use this coupon`);
  }
  // A per-customer limit can only be enforced against a known customer (an
  // anonymous walk-in could otherwise reuse a "once per customer" code).
  if (coupon.per_user_limit !== null && !userId) {
    throw ApiError.badRequest('This coupon needs a registered customer with a verified phone number');
  }
  if (coupon.per_user_limit !== null) {
    const used = await db.query(
      `SELECT COUNT(*)::int AS n FROM coupon_redemptions
        WHERE coupon_id = $1 AND user_id = $2 AND released_at IS NULL`,
      [coupon.id, userId]
    );
    if (used.rows[0].n >= coupon.per_user_limit) {
      throw ApiError.badRequest('You have already used this coupon');
    }
  }

  return { coupon, discount: computeDiscount(coupon, subtotal) };
};

/** Validate + reserve one use (locks the coupon row; call inside a transaction). */
const applyCoupon = async (client, opts) => {
  const result = await checkCoupon(client, { ...opts, lock: true });
  await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [result.coupon.id]);
  return result;
};

/** Link a reserved use to the order it was applied to. */
const recordRedemption = (client, { couponId, userId = null, orderId, discount }) =>
  client.query(
    `INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount)
     VALUES ($1, $2, $3, $4)`,
    [couponId, userId, orderId, discount]
  );

/**
 * Give back the coupon use held by an order (cancel / expiry / failed payment).
 * Idempotent: only an unreleased redemption is released.
 */
const releaseCouponForOrder = async (client, orderId) => {
  const { rows } = await client.query(
    `UPDATE coupon_redemptions SET released_at = NOW()
      WHERE order_id = $1 AND released_at IS NULL
      RETURNING coupon_id`,
    [orderId]
  );
  for (const r of rows) {
    await client.query(
      'UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1',
      [r.coupon_id]
    );
  }
  return rows.length;
};

module.exports = { computeDiscount, checkCoupon, applyCoupon, recordRedemption, releaseCouponForOrder };
