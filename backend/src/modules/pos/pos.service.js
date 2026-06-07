const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { generateOrderNumber } = require('../../utils/generateOrderNumber');

/**
 * POS service — walk-in sales.
 * Creates an order with channel='pos' and a completed transaction, decrementing
 * inventory atomically and recording a stock-movement ledger entry per line.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Validate a coupon and (if valid) reserve one use within the current
 * transaction. Locks the coupon row FOR UPDATE so concurrent sales cannot
 * exceed max_uses.
 *
 * @returns {Promise<{ couponId: string, discount: number }>}
 */
const applyCoupon = async (client, code, subtotal) => {
  const { rows } = await client.query(
    'SELECT * FROM coupons WHERE code = $1 FOR UPDATE',
    [code]
  );
  const coupon = rows[0];

  if (!coupon || !coupon.is_active) {
    throw ApiError.badRequest('Coupon is invalid or inactive');
  }

  const now = new Date();
  if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_until)) {
    throw ApiError.badRequest('Coupon has expired or is not yet valid');
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    throw ApiError.badRequest('Coupon usage limit reached');
  }
  if (subtotal < Number(coupon.min_order_value)) {
    throw ApiError.badRequest(
      `Order subtotal must be at least ${coupon.min_order_value} to use this coupon`
    );
  }

  const discount = coupon.discount_type === 'percentage'
    ? round2(subtotal * (Number(coupon.discount_value) / 100))
    : round2(Number(coupon.discount_value));

  await client.query(
    'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1',
    [coupon.id]
  );

  return { couponId: coupon.id, discount };
};

const createSale = async (data, operator) => {
  const branchId = operator.branch_id;
  if (!branchId) {
    throw ApiError.badRequest('Operator is not assigned to a branch');
  }

  return withTransaction(async (client) => {
    // 1. Resolve each line against the catalogue, decrement stock atomically,
    //    and capture point-of-sale snapshots.
    let subtotal = 0;
    const lines = [];

    for (const item of data.items) {
      const variantRes = await client.query(
        `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
          WHERE pv.id = $1 AND pv.is_active = TRUE`,
        [item.variant_id]
      );
      const variant = variantRes.rows[0];
      if (!variant) {
        throw ApiError.notFound(`Variant ${item.variant_id} not found`);
      }

      // Atomic conditional decrement — only succeeds if enough stock exists.
      const dec = await client.query(
        `UPDATE inventory
            SET quantity = quantity - $1
          WHERE variant_id = $2 AND branch_id = $3 AND quantity >= $1`,
        [item.quantity, item.variant_id, branchId]
      );
      if (dec.rowCount === 0) {
        throw ApiError.conflict(
          `${variant.product_name} — ${variant.variant_name} is out of stock at this branch`
        );
      }

      const lineTotal = round2(item.unit_price * item.quantity);
      subtotal = round2(subtotal + lineTotal);

      lines.push({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: round2(item.unit_price),
        total_price: lineTotal,
        product_name: variant.product_name,
        variant_name: variant.variant_name,
        sku: variant.sku,
      });
    }

    // 2. Discounts: manual discount from the operator + optional coupon.
    let couponId = null;
    let discount = round2(data.discount || 0);
    if (data.coupon_code) {
      const applied = await applyCoupon(client, data.coupon_code, subtotal);
      couponId = applied.couponId;
      discount = round2(discount + applied.discount);
    }
    if (discount > subtotal) discount = subtotal;

    const shippingFee = 0; // walk-in sale, no shipping
    const total = round2(subtotal - discount + shippingFee);

    // 3. Persist the order.
    const customerParts = [data.customer_name, data.customer_phone].filter(Boolean);
    const customerNote = customerParts.length
      ? `Walk-in: ${customerParts.join(' / ')}`
      : null;

    const orderRes = await client.query(
      `INSERT INTO orders
         (order_number, branch_id, channel, status, subtotal, discount,
          shipping_fee, total_amount, customer_note, pos_operator_id, coupon_id)
       VALUES ($1, $2, 'pos', 'delivered', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [generateOrderNumber(), branchId, subtotal, discount, shippingFee,
       total, customerNote, operator.id, couponId]
    );
    const order = orderRes.rows[0];

    // 4. Order items (with snapshots) + stock-movement ledger entries.
    const items = [];
    for (const line of lines) {
      const itemRes = await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, quantity, unit_price, total_price,
            product_name, variant_name, sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [order.id, line.variant_id, line.quantity, line.unit_price,
         line.total_price, line.product_name, line.variant_name, line.sku]
      );
      items.push(itemRes.rows[0]);

      await client.query(
        `INSERT INTO stock_movements
           (variant_id, branch_id, movement_type, quantity_delta,
            reference_type, reference_id, performed_by, note)
         VALUES ($1, $2, 'sale', $3, 'order', $4, $5, $6)`,
        [line.variant_id, branchId, -line.quantity, order.id, operator.id,
         `POS sale ${order.order_number}`]
      );
    }

    // 5. Record the (already-collected) payment.
    await client.query(
      `INSERT INTO transactions (order_id, payment_method, payment_status, amount)
       VALUES ($1, $2, 'completed', $3)`,
      [order.id, data.payment_method, total]
    );

    return { ...order, items };
  });
};

const getSales = async (queryParams, user) => {
  const { page, limit, offset } = parsePagination(queryParams);
  // TODO: Fetch POS orders, filter by branch for branch_admin
  return paginatedResponse([], 0, { page, limit });
};

const getSaleById = async (id) => {
  throw ApiError.notFound('Not implemented yet');
};

module.exports = { createSale, getSales, getSaleById };
