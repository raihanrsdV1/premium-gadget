const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { paginatedResponse } = require('../../utils/pagination');
const { generateOrderNumber } = require('../../utils/generateOrderNumber');
const { effectivePriceSql } = require('../../utils/pricing');
const { escapeLike } = require('../../utils/validators');
const { audit } = require('../../utils/audit');
const { applyCoupon, recordRedemption } = require('../coupons/coupon.apply');
const settings = require('../settings/settings.service');
const sslcommerz = require('../payments/sslcommerz.client');
const lifecycle = require('./order.lifecycle');

const {
  withOrderTx, lockOrder, commitReservation, releaseReservation, restock,
  appendSystemNote, recordHistory, setStatus, actorRef,
} = lifecycle;

// All money maths in integer paisa; DECIMAL(12,2) in the DB.
const toPaisa = (v) => Math.round(Number(v) * 100);
const fromPaisa = (p) => p / 100;

// SSLCommerz rejects transactions below ৳10.
const MIN_ONLINE_PAYMENT_PAISA = 1000;

/**
 * Allowed admin status changes. Anything not listed is a 409.
 * Stock: pending → confirmed commits the reservation; cancelling a pending
 * order releases it; cancelling/returning a committed order restocks.
 */
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const isCodOrder = (order) => order.payment_method === 'cod';

const MIXED_BRANCH_MESSAGE = 'This order includes stock from another branch — a super admin must handle it';

/**
 * What a staff user may do with an order.
 *   super_admin  → 'write'
 *   branch_admin → 'read' if the order or ANY of its lines is from their
 *                  branch; 'write' (status, reconcile) only if EVERY line is,
 *                  so one branch can't move another branch's stock.
 *
 * @param {{ query: Function }} db
 * @returns {Promise<'none'|'read'|'write'>}
 */
const staffAccess = async (db, user, order) => {
  if (user.role === 'super_admin') return 'write';
  if (!user.branch_id) return 'none';
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE branch_id = $2)::int AS mine
       FROM order_items WHERE order_id = $1`,
    [order.id, user.branch_id]
  );
  const { total, mine } = rows[0];
  if (total === 0) return order.branch_id === user.branch_id ? 'write' : 'none';
  if (mine === total) return 'write';
  return mine > 0 || order.branch_id === user.branch_id ? 'read' : 'none';
};

/** Throw 404 (can't see) or 403 (can see, can't change) unless allowed. */
const assertStaffAccess = async (db, user, order, need) => {
  const access = order ? await staffAccess(db, user, order) : 'none';
  if (access === 'none') throw ApiError.notFound('Order not found');
  if (need === 'write' && access !== 'write') throw ApiError.forbidden(MIXED_BRANCH_MESSAGE);
  return access;
};

const place = (v) => String(v ?? '').trim().toLowerCase();

/**
 * The delivery zone for an address: a zone listing its district, else one
 * listing its division, else the default zone (null if none is marked).
 */
const zoneForAddress = (zones, address) => {
  const district = place(address.district);
  const division = place(address.division);
  return zones.find((zn) => (zn.districts || []).some((d) => place(d) === district))
    || zones.find((zn) => (zn.divisions || []).some((d) => place(d) === division))
    || zones.find((zn) => zn.is_default === true)
    || null;
};

/**
 * Shipping zone for checkout, derived from the address (never chosen by the
 * client). A shipping_method that names a different zone is refused.
 */
const resolveShippingZone = (zones, address, requested) => {
  if (requested && !zones.some((zn) => zn.code === requested)) throw ApiError.badRequest('Unknown shipping method');
  let zone = zoneForAddress(zones, address);
  // Zone settings saved before zones had is_default: keep the old behaviour.
  if (!zone) zone = zones.find((zn) => zn.code === requested) || zones[0];
  if (requested && requested !== zone.code) {
    throw ApiError.badRequest("The delivery area doesn't match the address");
  }
  return zone;
};

// ─── Checkout ───────────────────────────────────────────────

/**
 * Reserve fungible stock on the active branch with the most available units
 * (quantity - reserved) for this variant.
 *
 * All of the variant's inventory rows are locked in id order and the branch
 * is chosen here from the locked (current) values. Choosing inside the query
 * with ORDER BY free DESC ... LIMIT 1 FOR UPDATE is unsafe: each transaction
 * sorts by its own snapshot, and Postgres keeps rows it locked and then
 * skipped, so two checkouts could hold-and-wait in opposite orders. With a
 * fixed lock order (lines in variant order, rows in id order) that can't
 * happen. The reserved <= quantity CHECK remains the backstop.
 *
 * @returns {Promise<string|null>} branch_id, or null when no single active branch can cover qty
 */
const reserveStock = async (client, variantId, qty) => {
  const { rows } = await client.query(
    `SELECT i.id, i.branch_id, i.quantity - i.reserved AS free, b.is_active
       FROM inventory i JOIN branches b ON b.id = i.branch_id
      WHERE i.variant_id = $1
      ORDER BY i.id
      FOR UPDATE OF i`,
    [variantId]
  );
  const best = rows
    .filter((r) => r.is_active && r.free >= qty)
    .sort((a, b) => b.free - a.free || (a.id < b.id ? -1 : 1))[0];
  if (!best) return null;
  await client.query('UPDATE inventory SET reserved = reserved + $1 WHERE id = $2', [qty, best.id]);
  return best.branch_id;
};

const shippingLine = (a) =>
  [a.full_name, a.phone, a.street, a.area, a.district, a.division, a.postal_code].filter(Boolean).join(', ');

/**
 * Place an online order (status 'pending') and reserve its stock.
 *
 * Prices come from the catalog (effective sale-aware price), never the
 * client. Card/mobile-banking orders then get an SSLCommerz session (created
 * after COMMIT — no external HTTP inside a DB transaction); the order is
 * confirmed only by a gateway-verified payment. COD orders hold their
 * reservation until staff confirm them.
 *
 * @param {object} data - validated checkout body
 * @param {object} user - req.user
 * @returns {Promise<{ order_id, order_number, total, redirect_url, payment_method, status, payment_status, gateway_error? }>}
 */
const create = async (data, user) => {
  const [shipping, checkoutCfg] = await Promise.all([
    settings.getSetting('shipping'),
    settings.getSetting('checkout'),
  ]);
  const zone = resolveShippingZone(shipping.zones, data.shipping_address, data.shipping_method);

  const units = data.items.reduce((n, i) => n + i.quantity, 0);
  if (units > checkoutCfg.max_units_per_order) {
    throw ApiError.badRequest(`At most ${checkoutCfg.max_units_per_order} items per order`);
  }

  const isCod = data.payment_method === 'cod';
  if (isCod && !checkoutCfg.cod_enabled) {
    throw ApiError.badRequest('Cash on delivery is not available right now');
  }
  // COD has no up-front payment; optionally require an OTP-verified number
  // (needs a working SMS gateway, so it's a setting — staff also confirm COD
  // orders by phone before shipping).
  if (isCod && checkoutCfg.cod_requires_verified_phone && !user.phone_verified) {
    throw ApiError.forbidden('Verify your phone number to use cash on delivery');
  }

  const addr = data.shipping_address;
  const snapshot = {
    full_name: addr.full_name,
    phone: addr.phone,
    division: addr.division,
    district: addr.district,
    area: addr.area ?? null,
    street: addr.street,
    postal_code: addr.postal_code ?? null,
  };

  const order = await withOrderTx(async (client, events) => {
    // One checkout at a time per customer, so the pending-order cap and
    // per-user coupon limits can't be raced with parallel requests. NO KEY
    // UPDATE doesn't block other tables' FK checks against this user.
    await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [user.id]);

    if (data.address_id) {
      const owned = await client.query('SELECT 1 FROM addresses WHERE id = $1 AND user_id = $2', [data.address_id, user.id]);
      if (!owned.rowCount) throw ApiError.notFound('Address not found');
    }

    const open = await client.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE user_id = $1 AND channel = 'online' AND status = 'pending' AND payment_status = 'pending'`,
      [user.id]
    );
    if (open.rows[0].n >= checkoutCfg.pending_order_limit) {
      throw ApiError.conflict(
        `You already have ${open.rows[0].n} unpaid orders. Complete payment for one of them from My Orders, or wait for it to expire, before placing another.`
      );
    }

    // Reserve in variant-id order (consistent lock order → no deadlocks
    // between concurrent multi-item checkouts); keep the customer's order for
    // display and for the order's primary branch.
    const sorted = data.items.map((item, index) => ({ ...item, index }))
      .sort((a, b) => (a.variant_id < b.variant_id ? -1 : a.variant_id > b.variant_id ? 1 : 0));

    let subtotalP = 0;
    const lines = [];
    for (const item of sorted) {
      const { rows } = await client.query(
        `SELECT pv.id, pv.sku, pv.variant_name, ${effectivePriceSql('pv')} AS price, p.name AS product_name
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
          WHERE pv.id = $1 AND pv.is_active = TRUE AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [item.variant_id]
      );
      const v = rows[0];
      if (!v) throw ApiError.notFound('A product in your cart is no longer available');

      const branchId = await reserveStock(client, item.variant_id, item.quantity);
      if (!branchId) throw ApiError.conflict(`${v.product_name} — ${v.variant_name} is out of stock`);

      const unitP = toPaisa(v.price);
      subtotalP += unitP * item.quantity;
      lines.push({
        index: item.index,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unitP,
        product_name: v.product_name,
        variant_name: v.variant_name,
        sku: v.sku,
        branch_id: branchId,
      });
    }
    lines.sort((a, b) => a.index - b.index);

    let coupon = null;
    let discountP = 0;
    if (data.coupon_code) {
      const applied = await applyCoupon(client, {
        code: data.coupon_code, subtotal: fromPaisa(subtotalP), userId: user.id, channel: 'online',
      });
      coupon = applied.coupon;
      discountP = Math.min(toPaisa(applied.discount), subtotalP);
    }

    const threshold = shipping.free_shipping_threshold;
    const shippingP = threshold !== null && threshold !== undefined && subtotalP >= toPaisa(threshold)
      ? 0
      : toPaisa(zone.fee);
    const totalP = subtotalP - discountP + shippingP;
    if (!isCod && totalP < MIN_ONLINE_PAYMENT_PAISA) {
      throw ApiError.badRequest('Order total is below the minimum for online payment');
    }
    const codCap = checkoutCfg.cod_max_order_value;
    if (isCod && codCap !== null && codCap !== undefined && totalP > toPaisa(codCap)) {
      throw ApiError.badRequest(`Cash on delivery is available for orders up to ৳${codCap}. Please pay online.`);
    }

    const note = [`Ship to: ${shippingLine(snapshot)}`, data.customer_note ? `Note: ${data.customer_note}` : null]
      .filter(Boolean).join('\n');

    const orderNumber = await generateOrderNumber(client);
    const { rows: [ord] } = await client.query(
      `INSERT INTO orders
         (order_number, user_id, address_id, branch_id, channel, status,
          subtotal, discount, shipping_fee, total_amount, customer_note, coupon_id,
          payment_method, payment_status, shipping_address, shipping_method)
       VALUES ($1, $2, $3, $4, 'online', 'pending', $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13)
       RETURNING *`,
      [
        orderNumber, user.id, data.address_id || null, lines[0].branch_id,
        fromPaisa(subtotalP), fromPaisa(discountP), fromPaisa(shippingP), fromPaisa(totalP),
        note, coupon?.id || null, data.payment_method, JSON.stringify(snapshot), zone.code,
      ]
    );

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, quantity, unit_price, list_price, total_price,
            product_name, variant_name, sku, branch_id)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)`,
        [ord.id, line.variant_id, line.quantity, fromPaisa(line.unitP), fromPaisa(line.unitP * line.quantity),
         line.product_name, line.variant_name, line.sku, line.branch_id]
      );
      await client.query(
        `INSERT INTO stock_movements
           (variant_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
         VALUES ($1, $2, 'reservation', $3, 'order', $4, $5, $6)`,
        [line.variant_id, line.branch_id, -line.quantity, ord.id, user.id, `Reserved for ${ord.order_number}`]
      );
    }

    if (coupon) {
      await recordRedemption(client, { couponId: coupon.id, userId: user.id, orderId: ord.id, discount: fromPaisa(discountP) });
    }

    await recordHistory(client, {
      orderId: ord.id, from: null, to: 'pending', actor: user,
      note: isCod ? 'Order placed (cash on delivery)' : 'Order placed (awaiting online payment)',
    });
    events.push({ order: ord, from: null, to: 'pending', actor: actorRef(user) });

    return { ...ord, _lines: lines };
  });

  const result = {
    order_id: order.id,
    order_number: order.order_number,
    total: Number(order.total_amount),
    redirect_url: null,
    payment_method: order.payment_method,
    status: order.status,
    payment_status: order.payment_status,
  };
  if (isCod) return result;

  // Gateway session OUTSIDE the transaction. On failure the order stays
  // pending with stock reserved; the customer can retry payment
  // (POST /payments/retry/:orderNumber) and the expiry job reclaims it.
  try {
    const session = await sslcommerz.createSession(order, sessionCustomer(order, user));
    result.redirect_url = session.gatewayUrl;
  } catch (err) {
    console.error(`⚠️  SSLCommerz session init failed for ${order.order_number}:`, err.message);
    result.gateway_error = 'Payment gateway is unavailable right now. Your order is reserved; retry payment from My Orders.';
  }
  return result;
};

/** Customer details for the gateway's hosted page, from the order snapshot. */
const sessionCustomer = (order, user) => {
  const a = order.shipping_address || {};
  return {
    name: a.full_name || user.full_name,
    email: user.email,
    phone: a.phone || user.phone,
    address: [a.street, a.area].filter(Boolean).join(', '),
    city: a.district || a.division,
    postcode: a.postal_code,
    numItems: (order._lines || []).reduce((n, l) => n + l.quantity, 0) || 1,
    productSummary: order._lines?.[0]?.product_name,
  };
};

// ─── Customer views ─────────────────────────────────────────

const CUSTOMER_ORDER_FIELDS = `
  o.id, o.order_number, o.status, o.channel,
  o.subtotal, o.discount, o.shipping_fee, o.total_amount, o.created_at,
  o.payment_method, o.payment_status, o.shipping_method, o.shipping_address,
  o.tracking_number, o.courier,
  COALESCE((
    SELECT json_agg(json_build_object(
             'product_name', oi.product_name,
             'variant_name', oi.variant_name,
             'sku', oi.sku,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price
           ) ORDER BY oi.created_at, oi.id)
      FROM order_items oi WHERE oi.order_id = o.id
  ), '[]') AS items,
  COALESCE((
    SELECT json_agg(json_build_object('to_status', h.to_status, 'created_at', h.created_at)
                    ORDER BY h.created_at, h.id)
      FROM order_status_history h WHERE h.order_id = o.id
  ), '[]') AS status_history`;

/** The customer's own orders, newest first (max 100), with items and timeline. */
const getMyOrders = async (user) => {
  const { rows } = await query(
    `SELECT ${CUSTOMER_ORDER_FIELDS}
       FROM orders o
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC, o.order_number DESC
      LIMIT 100`,
    [user.id]
  );
  return rows;
};

/** One of the customer's orders by order number (404 for anyone else's). */
const getMyOrder = async (user, orderNumber) => {
  const { rows } = await query(
    `SELECT ${CUSTOMER_ORDER_FIELDS}, o.customer_note, o.updated_at
       FROM orders o
      WHERE o.user_id = $1 AND o.order_number = $2`,
    [user.id, orderNumber]
  );
  if (!rows.length) throw ApiError.notFound('Order not found');
  return rows[0];
};

// ─── Admin ──────────────────────────────────────────────────

const SORTS = {
  newest: 'o.created_at DESC, o.order_number DESC',
  oldest: 'o.created_at ASC, o.order_number ASC',
  total_desc: 'o.total_amount DESC, o.created_at DESC',
  total_asc: 'o.total_amount ASC, o.created_at DESC',
};

/**
 * Paginated order list for staff. branch_admin is pinned to their branch.
 *
 * @param {object} q - validated list query
 * @param {object} user - req.user
 */
const getAll = async (q, user) => {
  const page = q.page || 1;
  const limit = q.limit || 20;
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };

  // An order belongs to a branch if it, or any of its lines, is from there.
  const BRANCH_SQL = '(o.branch_id = ? OR EXISTS (SELECT 1 FROM order_items bi WHERE bi.order_id = o.id AND bi.branch_id = ?))';
  if (user.role !== 'super_admin') {
    if (!user.branch_id) return paginatedResponse([], 0, { page, limit });
    add(BRANCH_SQL, user.branch_id);
  } else if (q.branch_id) {
    add(BRANCH_SQL, q.branch_id);
  }
  if (q.status) add('o.status = ?', q.status);
  if (q.payment_status) add('o.payment_status = ?', q.payment_status);
  if (q.payment_method) add('o.payment_method = ?', q.payment_method);
  if (q.channel) add('o.channel = ?', q.channel);
  if (q.from) add(`o.created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Dhaka')`, q.from);
  if (q.to) add(`o.created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')`, q.to);
  if (q.q) {
    add(
      `(o.order_number ILIKE ? OR u.phone ILIKE ? OR u.full_name ILIKE ?
        OR o.shipping_address->>'phone' ILIKE ? OR o.shipping_address->>'full_name' ILIKE ?
        OR to_jsonb(o)->>'customer_phone' ILIKE ? OR to_jsonb(o)->>'customer_name' ILIKE ?)`,
      `%${escapeLike(q.q)}%`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN branches b ON b.id = o.branch_id`;

  const [list, count] = await Promise.all([
    query(
      `SELECT o.id, o.order_number, o.channel, o.status, o.payment_method, o.payment_status,
              o.branch_id, b.name AS branch_name,
              o.subtotal, o.discount, o.shipping_fee, o.total_amount,
              o.shipping_method, o.tracking_number, o.courier, o.created_at, o.updated_at,
              o.user_id,
              -- POS walk-in details live in columns owned by migration 005; read
              -- them through to_jsonb so this query doesn't depend on them.
              COALESCE(u.full_name, o.shipping_address->>'full_name', to_jsonb(o)->>'customer_name') AS customer_name,
              COALESCE(u.phone, o.shipping_address->>'phone', to_jsonb(o)->>'customer_phone') AS customer_phone,
              (SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         ${from} ${whereSql}
        ORDER BY ${SORTS[q.sort] || SORTS.newest}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    ),
    query(`SELECT COUNT(*)::int AS n ${from} ${whereSql}`, params),
  ]);
  return paginatedResponse(list.rows, count.rows[0].n, { page, limit });
};

/**
 * Full order for staff: items, transactions (no raw gateway payload), status
 * history, shipping address, coupon and customer. 404 outside the caller's
 * branch.
 */
const getById = async (id, user) => {
  const { rows } = await query(
    `SELECT o.*, b.name AS branch_name, c.code AS coupon_code,
            u.full_name AS customer_full_name, u.phone AS customer_phone, u.email AS customer_email
       FROM orders o
       LEFT JOIN branches b ON b.id = o.branch_id
       LEFT JOIN coupons c ON c.id = o.coupon_id
       LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = $1`,
    [id]
  );
  const row = rows[0];
  await assertStaffAccess({ query }, user, row, 'read');

  const [items, transactions, history] = await Promise.all([
    query(
      `SELECT oi.id, oi.variant_id, oi.product_name, oi.variant_name, oi.sku, oi.quantity,
              oi.unit_price, oi.list_price, oi.total_price, oi.branch_id, b.name AS branch_name
         FROM order_items oi LEFT JOIN branches b ON b.id = oi.branch_id
        WHERE oi.order_id = $1 ORDER BY oi.created_at, oi.id`,
      [id]
    ),
    query(
      `SELECT id, payment_method, payment_status, amount, currency,
              ssl_transaction_id, ssl_validation_id, ssl_status, ssl_amount, ssl_store_amount,
              ssl_card_type, ssl_card_no, ssl_bank_tran_id, ssl_tran_date, ssl_risk_level, ssl_risk_title,
              note, recorded_by, created_at, updated_at
         FROM transactions WHERE order_id = $1 ORDER BY created_at, id`,
      [id]
    ),
    query(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, h.actor_id,
              a.full_name AS actor_name, a.role AS actor_role
         FROM order_status_history h LEFT JOIN users a ON a.id = h.actor_id
        WHERE h.order_id = $1 ORDER BY h.created_at, h.id`,
      [id]
    ),
  ]);

  const { customer_full_name: name, customer_phone: phone, customer_email: email, ...order } = row;
  return {
    ...order,
    customer: order.user_id ? { id: order.user_id, full_name: name, phone, email } : null,
    items: items.rows,
    transactions: transactions.rows,
    status_history: history.rows,
  };
};

const loadForStaff = async (client, id, user, need) => {
  const order = await lockOrder(client, id);
  await assertStaffAccess(client, user, order, need);
  return order;
};

/**
 * Staff status change, enforcing TRANSITIONS and the stock/payment side
 * effects of each step. The order row is locked for the whole change.
 *
 * @param {string} id
 * @param {object} body - validated { status, note?, tracking_number?, courier?, mark_paid?, payment_method?, restock? }
 * @param {object} actor - req.user
 */
const updateStatus = async (id, body, actor) => {
  await withOrderTx(async (client, events) => {
    const order = await loadForStaff(client, id, actor, 'write');
    if (order.channel === 'pos') throw ApiError.conflict('POS sales are managed from the POS screen');

    const from = order.status;
    const to = body.status;
    if (!(TRANSITIONS[from] || []).includes(to)) {
      throw ApiError.conflict(`Cannot change an order from ${from} to ${to}`);
    }

    const cod = isCodOrder(order);
    const paid = order.payment_status === 'completed' || order.payment_status === 'processing';
    const note = body.note || null;
    const fields = {};
    let historyNote = note;

    if (from === 'pending' && to === 'confirmed') {
      if (!cod && order.payment_status !== 'completed') {
        if (!body.mark_paid) throw ApiError.conflict('This online order has not been paid yet');
        if (actor.role !== 'super_admin') throw ApiError.forbidden('Only the owner can mark an order as paid');
        await recordManualPayment(client, order, body, actor);
        fields.payment_status = 'completed';
        historyNote = `Marked paid: ${note}`;
      }
      await commitReservation(client, order, { actor, strict: true });
    } else if (to === 'cancelled') {
      fields.cancel_reason = 'staff';
      if (from === 'pending') {
        await releaseReservation(client, order, { actor, reason: 'staff' });
      } else {
        await restock(client, order, { actor, note: `Cancelled ${order.order_number}` });
      }
      if (order.payment_status === 'pending') fields.payment_status = 'cancelled';
    } else if (to === 'shipped') {
      if (body.tracking_number) fields.tracking_number = body.tracking_number;
      if (body.courier) fields.courier = body.courier;
    } else if (to === 'delivered') {
      if (cod && order.payment_status !== 'completed') {
        await client.query(
          `INSERT INTO transactions (order_id, payment_method, payment_status, amount, currency, note, recorded_by)
           VALUES ($1, 'cash', 'completed', $2, 'BDT', 'Cash collected on delivery', $3)`,
          [order.id, order.total_amount, actor.id]
        );
        fields.payment_status = 'completed';
      }
    } else if (to === 'returned') {
      await restock(client, order, { actor, stock: body.restock !== false, note: `Returned ${order.order_number}` });
      if (order.payment_status === 'pending') fields.payment_status = 'cancelled';
    }

    await setStatus(client, order, to, { actor, note: historyNote, fields, events });

    if ((to === 'cancelled' || to === 'returned') && paid) {
      await appendSystemNote(
        client, order.id,
        `${to === 'cancelled' ? 'Cancelled' : 'Returned'} with a payment on file (${order.payment_status}) — refund required.`
      );
    }

    await audit({
      actor, action: 'order.status', entity: 'order', entityId: order.id, db: client,
      data: { from, to, note, mark_paid: body.mark_paid || undefined, restock: body.restock },
    });
  });
  return getById(id, actor);
};

/**
 * super_admin confirming an online order paid outside the gateway flow. A
 * gateway payment held for risk review is promoted; otherwise a manual
 * transaction is recorded.
 */
const recordManualPayment = async (client, order, body, actor) => {
  const held = await client.query(
    `SELECT id FROM transactions
      WHERE order_id = $1 AND payment_status = 'processing' AND ssl_validation_id IS NOT NULL
      ORDER BY created_at LIMIT 1`,
    [order.id]
  );
  if (held.rows[0]) {
    await client.query(
      `UPDATE transactions SET payment_status = 'completed', note = $2, recorded_by = $3 WHERE id = $1`,
      [held.rows[0].id, `Approved after review: ${body.note}`, actor.id]
    );
    return;
  }
  if (!body.payment_method) throw ApiError.badRequest('payment_method is required when marking an order paid');
  await client.query(
    `INSERT INTO transactions (order_id, payment_method, payment_status, amount, currency, note, recorded_by)
     VALUES ($1, $2, 'completed', $3, 'BDT', $4, $5)`,
    [order.id, body.payment_method, order.total_amount, body.note, actor.id]
  );
};

/**
 * Replace the staff's free-text note. System flags live in system_note,
 * which this can't touch; the audit keeps the previous text.
 */
const updateAdminNote = async (id, { admin_note: adminNote }, actor) => {
  await withOrderTx(async (client) => {
    const order = await loadForStaff(client, id, actor, 'read');
    if (order.channel === 'pos') throw ApiError.conflict('POS sales are managed from the POS screen');
    const after = adminNote || null;
    await client.query('UPDATE orders SET admin_note = $2 WHERE id = $1', [order.id, after]);
    await audit({
      actor, action: 'order.note', entity: 'order', entityId: order.id, db: client,
      data: { before: order.admin_note, after },
    });
  });
  return getById(id, actor);
};

/**
 * super_admin records that a cancelled/returned order's payment was refunded
 * (the refund itself happens in the SSLCommerz panel / bKash app).
 */
const updatePayment = async (id, { payment_status: paymentStatus, note }, actor) => {
  await withOrderTx(async (client) => {
    const order = await loadForStaff(client, id, actor, 'write');
    if (!['completed', 'processing'].includes(order.payment_status)) {
      throw ApiError.conflict('Only a paid order can be marked refunded');
    }
    if (!['cancelled', 'returned'].includes(order.status)) {
      throw ApiError.conflict('Cancel or return the order before recording a refund');
    }
    await client.query(
      `UPDATE transactions SET payment_status = 'refunded',
              note = concat_ws(E'\\n', NULLIF(note, ''), $2::text), recorded_by = $3
        WHERE order_id = $1 AND payment_status IN ('completed', 'processing')`,
      [order.id, `Refunded: ${note}`, actor.id]
    );
    await client.query('UPDATE orders SET payment_status = $2 WHERE id = $1', [order.id, paymentStatus]);
    await appendSystemNote(client, order.id, `Refunded: ${note}`);
    await audit({
      actor, action: 'order.payment', entity: 'order', entityId: order.id, db: client,
      data: { from: order.payment_status, to: paymentStatus, note },
    });
  });
  return getById(id, actor);
};

/**
 * Release a COD order that staff never confirmed within `hours` (setting
 * checkout.cod_confirm_hours), so unconfirmed COD orders can't hold stock
 * indefinitely. Re-checked under the row lock; staff confirming at the same
 * moment wins if it gets the lock first.
 *
 * @returns {Promise<object|null>} the cancelled order, or null if not releasable
 */
const expireUnconfirmedCod = (orderId, { hours }) =>
  withOrderTx(async (client, events) => {
    const { rows } = await client.query(
      `SELECT * FROM orders
        WHERE id = $1 AND channel = 'online' AND payment_method = 'cod'
          AND status = 'pending' AND payment_status = 'pending'
          AND created_at < NOW() - make_interval(hours => $2::int)
        FOR UPDATE`,
      [orderId, hours]
    );
    const order = rows[0];
    if (!order) return null;
    await releaseReservation(client, order, { reason: 'expired' });
    return setStatus(client, order, 'cancelled', {
      events,
      note: `Cash on delivery order not confirmed within ${hours}h; reservation released`,
      fields: { payment_status: 'cancelled', cancel_reason: 'expired' },
    });
  });

module.exports = {
  TRANSITIONS,
  expireUnconfirmedCod,
  MIXED_BRANCH_MESSAGE,
  staffAccess,
  assertStaffAccess,
  zoneForAddress,
  resolveShippingZone,
  reserveStock,
  create,
  sessionCustomer,
  getMyOrders,
  getMyOrder,
  getAll,
  getById,
  updateStatus,
  updateAdminNote,
  updatePayment,
  // lifecycle helpers (shared with payments + jobs)
  ...lifecycle,
};
