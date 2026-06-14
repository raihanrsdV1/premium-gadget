const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { generateOrderNumber } = require('../../utils/generateOrderNumber');
const sslcommerz = require('../payments/sslcommerz.client');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const SHIPPING_FEES = { inside_dhaka: 100, outside_dhaka: 200 };

// ─── Coupon (validate + reserve one use within the tx) ──────────────────────
const applyCoupon = async (client, code, subtotal) => {
  const { rows } = await client.query('SELECT * FROM coupons WHERE code = $1 FOR UPDATE', [code]);
  const coupon = rows[0];
  if (!coupon || !coupon.is_active) throw ApiError.badRequest('Coupon is invalid or inactive');

  const now = new Date();
  if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_until)) {
    throw ApiError.badRequest('Coupon has expired or is not yet valid');
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    throw ApiError.badRequest('Coupon usage limit reached');
  }
  if (subtotal < Number(coupon.min_order_value)) {
    throw ApiError.badRequest(`Order subtotal must be at least ${coupon.min_order_value} to use this coupon`);
  }
  const discount = coupon.discount_type === 'percentage'
    ? round2(subtotal * (Number(coupon.discount_value) / 100))
    : round2(Number(coupon.discount_value));

  await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
  return { couponId: coupon.id, discount };
};

// Reserve fungible stock: atomically bump reserved on the branch with the most
// available stock for this variant. Returns the branch_id, or throws if no
// single branch can cover the quantity.
const reserveFungible = async (client, variantId, qty) => {
  const r = await client.query(
    `UPDATE inventory
        SET reserved = reserved + $1
      WHERE id = (
        SELECT id FROM inventory
         WHERE variant_id = $2 AND (quantity - reserved) >= $1
         ORDER BY (quantity - reserved) DESC
         LIMIT 1
         FOR UPDATE
      )
      RETURNING branch_id`,
    [qty, variantId]
  );
  if (!r.rows.length) return null;
  return r.rows[0].branch_id;
};

// Reserve `qty` serialized units (used items). Returns [{ unitId, branchId }].
const reserveSerializedUnits = async (client, variantId, qty) => {
  const units = [];
  for (let i = 0; i < qty; i++) {
    const r = await client.query(
      `UPDATE inventory_units
          SET status = 'reserved'
        WHERE id = (
          SELECT id FROM inventory_units
           WHERE variant_id = $1 AND status = 'in_stock'
           ORDER BY received_at ASC
           LIMIT 1
           FOR UPDATE
        )
        RETURNING id, branch_id`,
      [variantId]
    );
    if (!r.rows.length) return null; // not enough units
    units.push({ unitId: r.rows[0].id, branchId: r.rows[0].branch_id });
  }
  return units;
};

/**
 * STEP 1 — Phase A: place an online order (status 'pending') and reserve stock.
 * Re-derives prices from the DB (never trusts the client), reserves stock,
 * writes order + items (with snapshots) + reservation movements, applies a
 * coupon, then creates the SSLCommerz session. Inventory.quantity is NOT
 * decremented yet — that happens on a validated payment (Phase B).
 *
 * @returns {Promise<{ order_id, order_number, total, redirect_url, gateway_error? }>}
 */
const create = async (data, user) => {
  if (!data.items || data.items.length === 0) {
    throw ApiError.badRequest('Order must contain at least one item');
  }
  const shippingFee = SHIPPING_FEES[data.shipping_method] ?? SHIPPING_FEES.inside_dhaka;

  const order = await withTransaction(async (client) => {
    let subtotal = 0;
    const lines = [];

    for (const item of data.items) {
      const vr = await client.query(
        `SELECT pv.id, pv.sku, pv.variant_name, pv.price,
                p.id AS product_id, p.name AS product_name, p.is_serialized
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
          WHERE pv.id = $1 AND pv.is_active = TRUE AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [item.variant_id]
      );
      const v = vr.rows[0];
      if (!v) throw ApiError.notFound(`Variant ${item.variant_id} not found`);

      const price = round2(v.price); // server-derived price — public endpoint
      const lineTotal = round2(price * item.quantity);
      subtotal = round2(subtotal + lineTotal);

      // Reserve stock (do not touch quantity yet).
      let branchId = null;
      let units = null;
      if (v.is_serialized) {
        units = await reserveSerializedUnits(client, item.variant_id, item.quantity);
        if (!units) {
          throw ApiError.conflict(`${v.product_name} — ${v.variant_name} is out of stock`);
        }
        branchId = units[0].branchId;
      } else {
        branchId = await reserveFungible(client, item.variant_id, item.quantity);
        if (!branchId) {
          throw ApiError.conflict(`${v.product_name} — ${v.variant_name} is out of stock`);
        }
      }

      lines.push({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: price,
        total_price: lineTotal,
        product_name: v.product_name,
        variant_name: v.variant_name,
        sku: v.sku,
        is_serialized: v.is_serialized,
        branchId,
        units,
      });
    }

    // Coupon
    let couponId = null;
    let discount = 0;
    if (data.coupon_code) {
      const applied = await applyCoupon(client, data.coupon_code, subtotal);
      couponId = applied.couponId;
      discount = applied.discount;
    }
    if (discount > subtotal) discount = subtotal;

    const total = round2(subtotal - discount + shippingFee);

    const addr = data.shipping_address || {};
    const noteParts = [addr.full_name, addr.phone, addr.street, addr.district, addr.division].filter(Boolean);
    const customerNote = noteParts.length ? `Ship to: ${noteParts.join(', ')}` : null;

    const orderRes = await client.query(
      `INSERT INTO orders
         (order_number, user_id, address_id, branch_id, channel, status,
          subtotal, discount, shipping_fee, total_amount, customer_note, coupon_id)
       VALUES ($1, $2, $3, NULL, 'online', 'pending', $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [generateOrderNumber(), user.id, data.address_id || null,
       subtotal, discount, shippingFee, total, customerNote, couponId]
    );
    const ord = orderRes.rows[0];

    // Order items (with snapshots) + reservation movements.
    for (const line of lines) {
      const oiRes = await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, quantity, unit_price, total_price, product_name, variant_name, sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [ord.id, line.variant_id, line.quantity, line.unit_price, line.total_price,
         line.product_name, line.variant_name, line.sku]
      );
      const orderItemId = oiRes.rows[0].id;

      if (line.is_serialized) {
        for (const u of line.units) {
          await client.query('UPDATE inventory_units SET order_item_id = $1 WHERE id = $2', [orderItemId, u.unitId]);
          await client.query(
            `INSERT INTO stock_movements
               (variant_id, branch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
             VALUES ($1, $2, $3, 'reservation', -1, 'order', $4, $5, $6)`,
            [line.variant_id, u.branchId, u.unitId, ord.id, user.id, `Reserved for ${ord.order_number}`]
          );
        }
      } else {
        await client.query(
          `INSERT INTO stock_movements
             (variant_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
           VALUES ($1, $2, 'reservation', $3, 'order', $4, $5, $6)`,
          [line.variant_id, line.branchId, -line.quantity, ord.id, user.id, `Reserved for ${ord.order_number}`]
        );
      }
    }

    return { ...ord, _lines: lines, _itemCount: lines.reduce((n, l) => n + l.quantity, 0) };
  });

  // Create the gateway session OUTSIDE the DB transaction (external HTTP).
  // If it fails, the order stays 'pending' with stock reserved (consistent with
  // the abandoned-order model; reservation expiry will reclaim it later).
  let redirectUrl = null;
  let gatewayError = null;
  try {
    const addr = data.shipping_address || {};
    const session = await sslcommerz.createSession(order, {
      name: addr.full_name || user.full_name,
      email: user.email,
      phone: addr.phone || user.phone,
      address: addr.street,
      city: addr.district || addr.division,
      numItems: order._itemCount,
      productSummary: order._lines[0]?.product_name,
    });
    redirectUrl = session.gatewayUrl;
  } catch (err) {
    gatewayError = err.message;
    console.error('⚠️  SSLCommerz session init failed:', err.message);
  }

  return {
    order_id: order.id,
    order_number: order.order_number,
    total: Number(order.total_amount),
    redirect_url: redirectUrl,
    ...(gatewayError ? { gateway_error: gatewayError } : {}),
  };
};

// Map an SSLCommerz card_type to our payment_method enum.
const mapPaymentMethod = (cardType = '') => {
  const t = String(cardType).toUpperCase();
  if (t.includes('BKASH')) return 'bkash';
  if (t.includes('NAGAD')) return 'nagad';
  return 'card';
};

/**
 * STEP 1 — Phase B (success): confirm a validated payment. Decrements quantity
 * and releases the reservation for fungible lines; marks serialized units sold.
 * Idempotent — only acts on a 'pending' order.
 */
const confirmOrderPaid = async (orderId, validation, rawBody) => {
  return withTransaction(async (client) => {
    const oRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = oRes.rows[0];
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status !== 'pending') return order; // already processed

    const moves = await client.query(
      `SELECT variant_id, branch_id, unit_id, quantity_delta
         FROM stock_movements WHERE reference_id = $1 AND movement_type = 'reservation'`,
      [orderId]
    );

    for (const m of moves.rows) {
      if (m.unit_id) {
        await client.query(
          `UPDATE inventory_units SET status = 'sold', sold_at = NOW() WHERE id = $1`,
          [m.unit_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (variant_id, branch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
           VALUES ($1, $2, $3, 'sale', -1, 'order', $4, $5, $6)`,
          [m.variant_id, m.branch_id, m.unit_id, orderId, order.user_id, `Sale ${order.order_number}`]
        );
      } else {
        const qty = Math.abs(m.quantity_delta);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, reserved = reserved - $1
            WHERE variant_id = $2 AND branch_id = $3`,
          [qty, m.variant_id, m.branch_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (variant_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
           VALUES ($1, $2, 'sale', $3, 'order', $4, $5, $6)`,
          [m.variant_id, m.branch_id, -qty, orderId, order.user_id, `Sale ${order.order_number}`]
        );
      }
    }

    await client.query(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [orderId]);

    await client.query(
      `INSERT INTO transactions
         (order_id, payment_method, payment_status, amount, currency,
          ssl_transaction_id, ssl_validation_id, ssl_status, ssl_amount,
          ssl_card_type, ssl_bank_tran_id, ssl_raw_response)
       VALUES ($1, $2, 'completed', $3, 'BDT', $4, $5, $6, $7, $8, $9, $10)`,
      [
        orderId,
        mapPaymentMethod(rawBody.card_type),
        Number(order.total_amount),
        rawBody.tran_id || order.order_number,
        validation.val_id || rawBody.val_id || null,
        validation.status || rawBody.status || null,
        validation.amount != null ? Number(validation.amount) : Number(order.total_amount),
        rawBody.card_type || null,
        rawBody.bank_tran_id || null,
        JSON.stringify(rawBody),
      ]
    );

    return { ...order, status: 'confirmed' };
  });
};

/**
 * STEP 1 — Phase B (fail/cancel): release the reservation and cancel the order.
 * Idempotent — only acts on a 'pending' order.
 */
const releaseOrder = async (orderId, reason = 'cancelled') => {
  return withTransaction(async (client) => {
    const oRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = oRes.rows[0];
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status !== 'pending') return order; // already processed

    const moves = await client.query(
      `SELECT variant_id, branch_id, unit_id, quantity_delta
         FROM stock_movements WHERE reference_id = $1 AND movement_type = 'reservation'`,
      [orderId]
    );

    for (const m of moves.rows) {
      if (m.unit_id) {
        await client.query(
          `UPDATE inventory_units SET status = 'in_stock', order_item_id = NULL WHERE id = $1`,
          [m.unit_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (variant_id, branch_id, unit_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
           VALUES ($1, $2, $3, 'release', 1, 'order', $4, $5, $6)`,
          [m.variant_id, m.branch_id, m.unit_id, orderId, order.user_id, `Released (${reason}) ${order.order_number}`]
        );
      } else {
        const qty = Math.abs(m.quantity_delta);
        await client.query(
          `UPDATE inventory SET reserved = reserved - $1 WHERE variant_id = $2 AND branch_id = $3`,
          [qty, m.variant_id, m.branch_id]
        );
        await client.query(
          `INSERT INTO stock_movements
             (variant_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
           VALUES ($1, $2, 'release', $3, 'order', $4, $5, $6)`,
          [m.variant_id, m.branch_id, qty, orderId, order.user_id, `Released (${reason}) ${order.order_number}`]
        );
      }
    }

    // Give back the coupon use, if any.
    if (order.coupon_id) {
      await client.query(
        'UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1',
        [order.coupon_id]
      );
    }

    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
    return { ...order, status: 'cancelled' };
  });
};

/**
 * STEP 3 — the authenticated user's orders, with line items.
 */
const getMyOrders = async (user) => {
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.channel,
            o.subtotal, o.discount, o.shipping_fee, o.total_amount, o.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'product_name', oi.product_name,
                  'variant_name', oi.variant_name,
                  'sku', oi.sku,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
                  'total_price', oi.total_price
                ) ORDER BY oi.created_at
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'
            ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC`,
    [user.id]
  );
  return result.rows;
};

/**
 * A single order owned by the user, looked up by order number (with items).
 */
const getMyOrder = async (user, orderNumber) => {
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.channel,
            o.subtotal, o.discount, o.shipping_fee, o.total_amount,
            o.customer_note, o.created_at, o.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'product_name', oi.product_name,
                  'variant_name', oi.variant_name,
                  'sku', oi.sku,
                  'quantity', oi.quantity,
                  'unit_price', oi.unit_price,
                  'total_price', oi.total_price
                ) ORDER BY oi.created_at
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'
            ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = $1 AND o.order_number = $2
      GROUP BY o.id`,
    [user.id, orderNumber]
  );
  if (!result.rows.length) throw ApiError.notFound('Order not found');
  return result.rows[0];
};

// ─── Unimplemented admin stubs (unchanged) ──────────────────────────────────
const getAll = async (queryParams) => {
  const { page, limit } = parsePagination(queryParams);
  return paginatedResponse([], 0, { page, limit });
};
const getById = async () => { throw ApiError.notFound('Not implemented yet'); };
const update = async () => { throw ApiError.internal('Not implemented yet'); };
const remove = async () => { throw ApiError.internal('Not implemented yet'); };

module.exports = {
  create,
  confirmOrderPaid,
  releaseOrder,
  getMyOrders,
  getMyOrder,
  getAll,
  getById,
  update,
  remove,
};
