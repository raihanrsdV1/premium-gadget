const { withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const orderEvents = require('../../events/orderEvents');
const { releaseCouponForOrder } = require('../coupons/coupon.apply');

/**
 * Order lifecycle building blocks shared by checkout, payment callbacks, the
 * reservation-expiry job and admin status changes. Re-exported from
 * order.service.
 *
 * Stock model (fungible only; inventory_units is just a serial registry):
 *   reserve   reserved += q                     (checkout)
 *   commit    quantity -= q, reserved -= q      ledger 'sale'     (confirmed)
 *   release   reserved -= q                     ledger 'release'  (unpaid order cancelled)
 *   restock   quantity += q                     ledger 'return'   (cancel/return after commit)
 *
 * Lock order everywhere: orders row → inventory rows → coupon rows, so
 * concurrent writers can't deadlock.
 */

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

/** Statuses in which the order's stock has been committed (sold). */
const COMMITTED = new Set(['confirmed', 'processing', 'shipped', 'delivered']);

const STATUS_TIMESTAMPS = {
  confirmed: 'confirmed_at',
  shipped: 'shipped_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
};

// Extra order columns a transition may set (fixed allowlist → safe to
// interpolate as identifiers).
const SETTABLE_FIELDS = new Set(['payment_status', 'tracking_number', 'courier', 'cancel_reason', 'payment_method']);

const actorRef = (actor) => (actor ? { id: actor.id, role: actor.role || null } : null);

/**
 * Run `fn(client, events)` in a transaction. Status events pushed onto
 * `events` are emitted only after COMMIT (never for a rolled-back change).
 */
const withOrderTx = async (fn) => {
  const events = [];
  const result = await withTransaction((client) => fn(client, events));
  for (const e of events) orderEvents.emit(orderEvents.STATUS_CHANGED, e);
  return result;
};

/** SELECT ... FOR UPDATE an order by id (null when missing). */
const lockOrder = async (client, orderId) => {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  return rows[0] || null;
};

/**
 * Order lines with the branch their stock came from, in a stable lock order.
 * Orders placed before migration 002 have no order_items.branch_id; their
 * branch is recovered from the reservation ledger entry.
 */
const orderLines = async (client, orderId) => {
  const { rows } = await client.query(
    `SELECT oi.id, oi.variant_id, oi.quantity, oi.sku,
            COALESCE(oi.branch_id, (
              SELECT sm.branch_id FROM stock_movements sm
               WHERE sm.reference_id = oi.order_id AND sm.variant_id = oi.variant_id
                 AND sm.movement_type = 'reservation'
               ORDER BY sm.created_at LIMIT 1
            )) AS branch_id
       FROM order_items oi
      WHERE oi.order_id = $1
      ORDER BY oi.variant_id, oi.id`,
    [orderId]
  );
  return rows;
};

const ledger = (client, { line, type, delta, order, actor, note }) =>
  client.query(
    `INSERT INTO stock_movements
       (variant_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, note)
     VALUES ($1, $2, $3, $4, 'order', $5, $6, $7)`,
    [line.variant_id, line.branch_id, type, delta, order.id, actor?.id || null, note]
  );

/**
 * Reserved → sold for every line.
 *
 * strict (staff confirming COD): a missing reservation is a 409.
 * non-strict (a verified gateway payment, which must never be rejected): fall
 * back to taking free stock, and report lines that couldn't be committed so
 * the caller can flag the order for staff.
 *
 * @returns {Promise<{ failed: string[] }>} SKUs that could not be committed
 */
const commitReservation = async (client, order, { actor = null, strict = true } = {}) => {
  const failed = [];
  for (const line of await orderLines(client, order.id)) {
    const q = line.quantity;
    let ok = false;
    if (line.branch_id) {
      const r = await client.query(
        `UPDATE inventory SET quantity = quantity - $1, reserved = reserved - $1
          WHERE variant_id = $2 AND branch_id = $3 AND reserved >= $1 AND quantity >= $1`,
        [q, line.variant_id, line.branch_id]
      );
      ok = r.rowCount > 0;
      if (!ok && !strict) {
        const free = await client.query(
          `UPDATE inventory SET quantity = quantity - $1
            WHERE variant_id = $2 AND branch_id = $3 AND quantity - reserved >= $1`,
          [q, line.variant_id, line.branch_id]
        );
        ok = free.rowCount > 0;
      }
    }
    if (!ok) {
      if (strict) throw ApiError.conflict(`Reserved stock for ${line.sku || 'an item'} is missing; check inventory first`);
      failed.push(line.sku || line.variant_id);
      continue;
    }
    await ledger(client, { line, type: 'sale', delta: -q, order, actor, note: `Sale ${order.order_number}` });
  }
  return { failed };
};

/**
 * Give back an unpaid order's reservation and its coupon use. Clamped at 0 so
 * a cancellation can never be blocked by a bad counter.
 */
const releaseReservation = async (client, order, { actor = null, reason = 'cancelled' } = {}) => {
  for (const line of await orderLines(client, order.id)) {
    if (!line.branch_id) continue;
    await client.query(
      `UPDATE inventory SET reserved = reserved - LEAST(reserved, $1)
        WHERE variant_id = $2 AND branch_id = $3`,
      [line.quantity, line.variant_id, line.branch_id]
    );
    await ledger(client, {
      line, type: 'release', delta: line.quantity, order, actor, note: `Released (${reason}) ${order.order_number}`,
    });
  }
  await releaseCouponForOrder(client, order.id);
};

/**
 * Put committed stock back on the shelf (cancel after confirm, or a return)
 * and release the coupon use.
 */
const restock = async (client, order, { actor = null, note = null, stock = true } = {}) => {
  if (stock) {
    for (const line of await orderLines(client, order.id)) {
      if (!line.branch_id) continue;
      await client.query(
        `INSERT INTO inventory (variant_id, branch_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (variant_id, branch_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
        [line.variant_id, line.branch_id, line.quantity]
      );
      await ledger(client, {
        line, type: 'return', delta: line.quantity, order, actor, note: note || `Restocked ${order.order_number}`,
      });
    }
  }
  await releaseCouponForOrder(client, order.id);
};

/**
 * Append a timestamped line to orders.system_note: flags raised by the system
 * (refund required, duplicate payment, gateway mismatch). Append-only and not
 * editable through any API, unlike the staff's free-text admin_note.
 */
const appendSystemNote = (client, orderId, text) =>
  client.query(
    `UPDATE orders
        SET system_note = concat_ws(E'\\n', NULLIF(system_note, ''),
              '[' || to_char(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD HH24:MI') || '] ' || $2::text)
      WHERE id = $1`,
    [orderId, String(text).slice(0, 1000)]
  );

/**
 * Insert one order_status_history row. clock_timestamp(), not NOW(), so
 * several transitions inside one transaction still sort correctly.
 */
const recordHistory = (client, { orderId, from, to, note = null, actor = null }) =>
  client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_id, created_at)
     VALUES ($1, $2, $3, $4, $5, clock_timestamp())`,
    [orderId, from, to, note ? String(note).slice(0, 1000) : null, actor?.id || null]
  );

/**
 * Change an order's status: sets the status timestamp and any allowlisted
 * extra fields, writes history, and queues the after-commit event.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} order   - the locked current row
 * @param {string} to
 * @param {{ actor?, note?, fields?, events: object[] }} opts
 * @returns {Promise<object>} the updated row
 */
const setStatus = async (client, order, to, { actor = null, note = null, fields = {}, events }) => {
  const params = [to];
  const sets = ['status = $1'];
  if (STATUS_TIMESTAMPS[to]) sets.push(`${STATUS_TIMESTAMPS[to]} = NOW()`);
  for (const [key, value] of Object.entries(fields)) {
    if (!SETTABLE_FIELDS.has(key)) throw new Error(`setStatus: field "${key}" not allowed`);
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  params.push(order.id);
  const { rows } = await client.query(
    `UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  await recordHistory(client, { orderId: order.id, from: order.status, to, note, actor });
  events.push({ order: rows[0], from: order.status, to, actor: actorRef(actor) });
  return rows[0];
};

module.exports = {
  ORDER_STATUSES,
  COMMITTED,
  withOrderTx,
  lockOrder,
  orderLines,
  commitReservation,
  releaseReservation,
  restock,
  appendSystemNote,
  recordHistory,
  setStatus,
  actorRef,
};
