const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const sslcommerz = require('./sslcommerz.client');
const { GATEWAY_ID, isGatewayUnavailable } = require('./gateway.shared');
const orderService = require('../orders/order.service');
const settings = require('../settings/settings.service');

const {
  withOrderTx, lockOrder, commitReservation, releaseReservation, appendSystemNote, setStatus, assertStaffAccess,
} = orderService;

/**
 * Online payment settlement (SSLCommerz).
 *
 * Trust model: nothing in a callback body is believed. The body only tells us
 * WHICH payment (val_id) or WHICH order (tran_id) to ask the gateway about,
 * server-to-server. The order to confirm is the one named by the GATEWAY's
 * tran_id, and the gateway's record must match it exactly (value_a = order
 * id, BDT, amount to the paisa) before anything changes. One val_id can be
 * recorded once (unique index), and an order holds at most one completed
 * gateway payment.
 *
 * "Don't know" (gateway down, timeout) never cancels anything: the order
 * stays pending and the expiry job / staff reconcile settle it later.
 */

/** What happened, used by the controller to pick the browser redirect. */
const OUTCOME = Object.freeze({
  SUCCESS: 'success', //               order is confirmed by this payment (now or earlier)
  HELD: 'held', //                     payment recorded but held for staff risk review
  PENDING: 'pending', //               undecided (gateway down / not yet recorded); reconciled later
  PAID_CANCELLED: 'paid_cancelled', // money received for an order that is no longer active
  RELEASED: 'released', //             unpaid order cancelled, reservation released
  UNPAID: 'unpaid', //                 no payment; order left as it was
  INVALID: 'invalid', //               nothing trustworthy to act on
});

// Higher wins when several gateway records are applied to one order.
const RANK = { invalid: 0, unpaid: 1, pending: 2, held: 3, paid_cancelled: 4, released: 1, success: 5 };

const PAID_STATUSES = new Set(['VALID', 'VALIDATED']);
// Gateway attempt states that mean "this attempt is over and no money moved".
// Anything else (PENDING, UNATTEMPTED, unknown) may still turn into a payment.
const TERMINAL_UNPAID = new Set(['FAILED', 'CANCELLED', 'EXPIRED']);
const INACTIVE_ORDER = new Set(['cancelled', 'returned']);

const RELEASE_NOTES = {
  failed: 'Payment failed at the gateway; reservation released',
  cancelled: 'Payment cancelled by the customer; reservation released',
  expired: 'Payment window expired; reservation released',
};

const upper = (v) => String(v ?? '').toUpperCase();
const present = (v) => v !== undefined && v !== null && v !== '';

const toPaisa = (v) => {
  if (!present(v)) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

const text = (v, max) => (present(v) ? String(v).slice(0, max) : null);
const amountOrNull = (v) => {
  const n = Number(v);
  return present(v) && Number.isFinite(n) && Math.abs(n) < 1e10 ? Math.round(n * 100) / 100 : null;
};

const formatTaka = (v) => `৳${Number(v).toFixed(2)}`;

/** An online, non-COD order still waiting for its gateway payment. */
const isAwaitingGatewayPayment = (order) =>
  order.channel === 'online' && order.payment_method !== 'cod'
  && order.status === 'pending' && order.payment_status === 'pending';

/**
 * Compare the gateway's record of a payment with our order.
 *
 * @param {object} payment - validation API response or transaction-query element
 * @param {object} order   - orders row
 * @returns {string[]} names of the failed checks (empty = matches)
 */
const verifyAgainstOrder = (payment, order) => {
  const problems = [];
  if (payment.tran_id !== order.order_number) problems.push('tran_id');
  if (payment.value_a !== order.id) problems.push('value_a');

  const currencies = [payment.currency_type, payment.currency].filter(present);
  if (!currencies.length || currencies.some((c) => upper(c) !== 'BDT')) problems.push('currency');

  const want = toPaisa(order.total_amount);
  const amounts = [payment.amount, payment.currency_amount].filter(present);
  if (!amounts.length || amounts.some((a) => toPaisa(a) !== want)) problems.push('amount');

  if (order.channel !== 'online') problems.push('channel');
  if (order.payment_method === 'cod') problems.push('cod');
  return problems;
};

/** Map SSLCommerz card_type (e.g. "BKASH-BKash", "VISA-Dutch Bangla") to our enum. */
const mapPaymentMethod = (cardType) => {
  const t = upper(cardType);
  if (t.includes('BKASH')) return 'bkash';
  if (t.includes('NAGAD')) return 'nagad';
  if (/VISA|MASTER|AMEX|NEXUS|UNIONPAY|DINERS|DISCOVER|JCB|CARD/.test(t)) return 'card';
  if (/BANK|IB-|TOUCH/.test(t)) return 'net_banking';
  return 'other';
};

const insertGatewayTx = (client, order, payment, paymentStatus) => {
  const raw = { ...payment };
  delete raw.store_passwd;
  return client.query(
    `INSERT INTO transactions
       (order_id, payment_method, payment_status, amount, currency,
        ssl_transaction_id, ssl_validation_id, ssl_status, ssl_amount, ssl_store_amount, ssl_currency,
        ssl_card_type, ssl_card_no, ssl_bank_tran_id, ssl_tran_date, ssl_risk_level, ssl_risk_title,
        ssl_raw_response)
     VALUES ($1, $2, $3, $4, 'BDT', $5, $6, $7, $8, $9, $10, $11, $12, $13,
             CASE WHEN $14::text ~ '^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$'
                  THEN ($14::text::timestamp AT TIME ZONE 'Asia/Dhaka') END,
             $15, $16, $17)`,
    [
      order.id, mapPaymentMethod(payment.card_type), paymentStatus, order.total_amount,
      text(payment.tran_id, 120), text(payment.val_id, 120), text(upper(payment.status), 30),
      amountOrNull(payment.amount), amountOrNull(payment.store_amount),
      text(payment.currency_type || payment.currency, 10),
      text(payment.card_type, 60), text(payment.card_no, 40), text(payment.bank_tran_id, 120),
      text(payment.tran_date, 30), text(payment.risk_level, 10), text(payment.risk_title, 120),
      JSON.stringify(raw),
    ]
  );
};

const hasCompletedPayment = async (client, orderId) => {
  const { rowCount } = await client.query(
    `SELECT 1 FROM transactions WHERE order_id = $1 AND payment_status = 'completed' LIMIT 1`,
    [orderId]
  );
  return rowCount > 0;
};

/** Outcome for a val_id we have already recorded against this order. */
const processedOutcome = (orderStatus, txStatus) => {
  if (INACTIVE_ORDER.has(orderStatus)) return OUTCOME.PAID_CANCELLED;
  if (txStatus === 'processing') return orderStatus === 'pending' ? OUTCOME.HELD : OUTCOME.SUCCESS;
  if (orderStatus === 'pending') return OUTCOME.PENDING;
  return OUTCOME.SUCCESS;
};

const outcomeForActivity = (order) => {
  if (INACTIVE_ORDER.has(order.status)) return OUTCOME.PAID_CANCELLED;
  return order.status === 'pending' ? OUTCOME.PENDING : OUTCOME.SUCCESS;
};

/**
 * Apply one payment record REPORTED BY THE GATEWAY to the order its tran_id
 * names. Idempotent and safe under concurrency (order row locked; unique
 * val_id index as the backstop).
 *
 * @param {object} payment - gateway record (never a callback body)
 * @param {{ source: string, allowValidated?: boolean, actor?: object }} opts
 *   allowValidated: accept status VALIDATED for a val_id we haven't recorded.
 *   Only for records fetched by OUR tran_id (transaction query); a VALIDATED
 *   answer to a client-supplied val_id means someone already used it.
 * @returns {Promise<{ outcome: string, ref?: string, problems?: string[] }>}
 */
const applyGatewayPayment = async (payment, { source, allowValidated = false, actor = null }) => {
  const valId = typeof payment?.val_id === 'string' ? payment.val_id : '';
  const tranId = typeof payment?.tran_id === 'string' ? payment.tran_id : '';
  if (!GATEWAY_ID.test(valId) || !GATEWAY_ID.test(tranId)) return { outcome: OUTCOME.INVALID };
  const status = upper(payment.status);
  if (!PAID_STATUSES.has(status)) return { outcome: OUTCOME.INVALID };

  const found = await query('SELECT id FROM orders WHERE order_number = $1', [tranId]);
  if (!found.rows[0]) {
    console.warn(`⚠️  ${source}: gateway payment ${valId} names unknown tran_id ${tranId}`);
    return { outcome: OUTCOME.INVALID };
  }

  try {
    return await withOrderTx(async (client, events) => {
      const order = await lockOrder(client, found.rows[0].id);
      const ref = order.order_number;

      const existing = await client.query(
        'SELECT order_id, payment_status FROM transactions WHERE ssl_validation_id = $1',
        [valId]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].order_id !== order.id) {
          console.warn(`⚠️  ${source}: val_id ${valId} is recorded against another order`);
          return { outcome: OUTCOME.INVALID, ref };
        }
        return { outcome: processedOutcome(order.status, existing.rows[0].payment_status), ref };
      }

      // A client-supplied val_id that the gateway says was already validated,
      // yet we have no record of: don't act on it here. Reconciliation by
      // our own tran_id (expiry job / staff) will settle the order.
      if (status === 'VALIDATED' && !allowValidated) return { outcome: OUTCOME.PENDING, ref };

      const problems = verifyAgainstOrder(payment, order);
      if (problems.length) {
        console.warn(`⚠️  ${source}: gateway payment ${valId} does not match order ${ref} (${problems.join(', ')})`);
        if (!String(order.system_note || '').includes(valId)) {
          await appendSystemNote(
            client, order.id,
            `Gateway reported payment ${valId} that failed verification (${problems.join(', ')}); not applied. Review it in the SSLCommerz panel.`
          );
        }
        return { outcome: OUTCOME.INVALID, ref, problems };
      }

      const amount = formatTaka(order.total_amount);

      // risk_level 1: the gateway itself doubts the payment. Record it, hold
      // the order for a human, and keep it out of automatic expiry.
      if (String(payment.risk_level ?? '') === '1') {
        await insertGatewayTx(client, order, payment, 'processing');
        if (isAwaitingGatewayPayment(order)) {
          await client.query(`UPDATE orders SET payment_status = 'processing' WHERE id = $1`, [order.id]);
        }
        await appendSystemNote(
          client, order.id,
          `Payment ${valId} (${amount}) flagged by the gateway as risky (${text(payment.risk_title, 60) || 'risk level 1'}). `
          + 'Held for review: verify it in the SSLCommerz panel, then confirm with mark_paid, or cancel and refund.'
        );
        if (INACTIVE_ORDER.has(order.status)) return { outcome: OUTCOME.PAID_CANCELLED, ref };
        return { outcome: order.status === 'pending' ? OUTCOME.HELD : OUTCOME.SUCCESS, ref };
      }

      // Already paid by another payment: this one is a duplicate charge.
      if (order.payment_status === 'completed' || (await hasCompletedPayment(client, order.id))) {
        await insertGatewayTx(client, order, payment, 'processing');
        await appendSystemNote(client, order.id, `Duplicate payment ${valId} (${amount}) for an already-paid order — refund required.`);
        return { outcome: outcomeForActivity(order), ref };
      }

      if (order.status === 'pending') {
        await insertGatewayTx(client, order, payment, 'completed');
        // A verified payment is never refused over stock bookkeeping; problems
        // are flagged for staff instead.
        const { failed } = await commitReservation(client, order, { actor, strict: false });
        await setStatus(client, order, 'confirmed', {
          actor, events, fields: { payment_status: 'completed' }, note: `Payment ${valId} verified (${source})`,
        });
        if (failed.length) {
          await appendSystemNote(client, order.id, `Paid, but stock could not be committed for ${failed.join(', ')} — check inventory.`);
        }
        if (order.payment_status === 'processing') {
          await appendSystemNote(client, order.id, 'Confirmed by a later payment; refund the earlier payment held for review.');
        }
        return { outcome: OUTCOME.SUCCESS, ref };
      }

      // Paid after the order was cancelled/expired: keep the money on record
      // and flag it. Never reported to the customer as a successful order.
      await insertGatewayTx(client, order, payment, 'completed');
      await client.query(`UPDATE orders SET payment_status = 'completed' WHERE id = $1`, [order.id]);
      if (INACTIVE_ORDER.has(order.status)) {
        const what = order.cancel_reason === 'expired' ? 'expired' : order.status;
        await appendSystemNote(client, order.id, `Payment ${valId} (${amount}) received after the order was ${what} — refund or reinstatement required.`);
        return { outcome: OUTCOME.PAID_CANCELLED, ref };
      }
      return { outcome: OUTCOME.SUCCESS, ref };
    });
  } catch (err) {
    if (err.code !== '23505') throw err;
    // A concurrent handler recorded the same payment first.
    const { rows } = await query(
      `SELECT t.payment_status, o.status, o.order_number
         FROM transactions t JOIN orders o ON o.id = t.order_id
        WHERE t.ssl_validation_id = $1`,
      [valId]
    );
    if (!rows[0]) return { outcome: OUTCOME.PENDING, ref: tranId };
    return { outcome: processedOutcome(rows[0].status, rows[0].payment_status), ref: rows[0].order_number };
  }
};

/**
 * Cancel an unpaid online order and release its stock + coupon. Re-checks the
 * state under the row lock, so it can't race a confirming payment.
 *
 * @returns {Promise<object|null>} the cancelled order, or null if it wasn't releasable
 */
const releaseUnpaidOrder = (orderId, { reason, actor = null, note = null }) =>
  withOrderTx(async (client, events) => {
    const order = await lockOrder(client, orderId);
    if (!order || !isAwaitingGatewayPayment(order)) return null;
    await releaseReservation(client, order, { actor, reason });
    return setStatus(client, order, 'cancelled', {
      actor,
      events,
      note: note || RELEASE_NOTES[reason] || 'Reservation released',
      fields: { payment_status: reason === 'failed' ? 'failed' : 'cancelled', cancel_reason: reason },
    });
  });

/** Gateway transaction-query element without anything sensitive, for staff. */
const summarizeElement = (e) => ({
  status: upper(e.status) || null,
  val_id: text(e.val_id, 120),
  amount: text(e.amount, 30),
  currency: text(e.currency_type || e.currency, 10),
  tran_date: text(e.tran_date, 30),
  card_type: text(e.card_type, 60),
  bank_tran_id: text(e.bank_tran_id, 120),
  risk_level: text(e.risk_level, 10),
  risk_title: text(e.risk_title, 120),
});

/**
 * Ask the gateway about every attempt for this order (by OUR tran_id) and
 * apply what it reports.
 *
 * @param {object} order
 * @param {{ source: string, release: 'never'|'terminal'|'unless_open'|'always', reason?: string, actor?: object }} opts
 *   release 'terminal': cancel only if the gateway shows every attempt ended
 *   unpaid (a forged fail/cancel can't cancel a customer still on the
 *   payment page). 'unless_open': cancel unless an attempt is still in
 *   progress (expiry job, inside the grace period). 'always': cancel unless
 *   paid (expiry job, past the hard cap).
 * @returns {Promise<{ outcome, ref, gateway?: 'unavailable', elements?: object[] }>}
 */
const reconcileOrder = async (order, { source, release = 'never', reason = 'failed', actor = null }) => {
  const ref = order.order_number;
  let elements;
  try {
    ({ elements } = await sslcommerz.queryByTranId(order.order_number));
  } catch (err) {
    if (isGatewayUnavailable(err)) {
      console.warn(`⚠️  ${source}: gateway unavailable for ${ref}: ${err.message}`);
      return { outcome: OUTCOME.PENDING, ref, gateway: 'unavailable' };
    }
    throw err;
  }
  elements = Array.isArray(elements) ? elements : [];

  const paid = elements.filter((e) => PAID_STATUSES.has(upper(e.status)));
  const matching = paid.filter((e) => verifyAgainstOrder(e, order).length === 0);
  // Matching payments first (the first confirms; any further ones are
  // duplicates to refund), then mismatches so they get flagged for staff.
  let best = null;
  for (const e of [...matching, ...paid.filter((p) => !matching.includes(p))]) {
    const r = await applyGatewayPayment(e, { source, allowValidated: true, actor });
    if (!best || RANK[r.outcome] > RANK[best.outcome]) best = r;
  }
  if (matching.length) return { ...best, ref, elements };

  const settled = elements.length > 0 && elements.every((e) => TERMINAL_UNPAID.has(upper(e.status)));
  // An attempt that is neither paid nor over: the customer may still be on
  // the payment page.
  const open = elements.some((e) => !PAID_STATUSES.has(upper(e.status)) && !TERMINAL_UNPAID.has(upper(e.status)));
  const shouldRelease = release === 'always'
    || (release === 'terminal' && settled)
    || (release === 'unless_open' && !open);
  if (!shouldRelease) return { outcome: OUTCOME.UNPAID, ref, elements };

  const released = await releaseUnpaidOrder(order.id, { reason, actor });
  return { outcome: released ? OUTCOME.RELEASED : OUTCOME.UNPAID, ref, elements };
};

// ─── Callbacks ──────────────────────────────────────────────

/**
 * success_url / IPN with a val_id: validate it with the gateway and apply the
 * gateway's answer.
 *
 * @param {{ val_id: string, tran_id?: string }} body - validated callback body
 */
const handleValidatedCallback = async (body, source = 'success') => {
  let payment;
  try {
    payment = await sslcommerz.validatePayment(body.val_id);
  } catch (err) {
    if (isGatewayUnavailable(err)) {
      console.warn(`⚠️  ${source}: gateway unavailable while validating: ${err.message}`);
      // tran_id here is client-supplied: only used to label the redirect.
      return { outcome: OUTCOME.PENDING, ref: body.tran_id || null, gateway: 'unavailable' };
    }
    if (err.code === 'INVALID_GATEWAY_ID') return { outcome: OUTCOME.INVALID };
    throw err;
  }
  return applyGatewayPayment(payment, { source });
};

/**
 * fail_url / cancel_url (and failure IPNs): the body is only a hint. Ask the
 * gateway what happened to this order's attempts; confirm if it was actually
 * paid, release only if every attempt really ended unpaid.
 *
 * @param {{ tran_id: string }} body
 * @param {'failed'|'cancelled'} reason
 */
const handleGatewayReturn = async (body, reason, source = reason) => {
  const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [body.tran_id]);
  const order = rows[0];
  if (!order) return { outcome: OUTCOME.INVALID };
  // Paid, held, cancelled, COD and POS orders can't be changed by a callback.
  if (!isAwaitingGatewayPayment(order)) return { outcome: OUTCOME.UNPAID, ref: order.order_number };
  return reconcileOrder(order, { source, release: 'terminal', reason });
};

/** ipn_url (server-to-server). */
const handleIpn = async (body) => {
  if (body.val_id) return handleValidatedCallback(body, 'ipn');
  return handleGatewayReturn({ tran_id: body.tran_id }, upper(body.status) === 'CANCELLED' ? 'cancelled' : 'failed', 'ipn');
};

// ─── Customer / staff / job entry points ────────────────────

/**
 * New gateway session for the customer's own pending online order (e.g. the
 * first session failed to open, or they closed the payment page).
 *
 * @returns {Promise<{ order_number: string, redirect_url: string|null, status: string, payment_status: string }>}
 */
const RETRY_MIN_REMAINING_MINUTES = 10;

const retryPayment = async (orderNumber, user) => {
  const { reservation_minutes: minutes } = await settings.getSetting('checkout');
  const { rows } = await query(
    `SELECT o.*, o.created_at < NOW() - make_interval(mins => $3::int) AS is_expired,
            o.created_at < NOW() - make_interval(mins => GREATEST($3::int - $4::int, 0)) AS is_closing
       FROM orders o WHERE o.order_number = $1 AND o.user_id = $2`,
    [orderNumber, user.id, minutes, RETRY_MIN_REMAINING_MINUTES]
  );
  const order = rows[0];
  if (!order) throw ApiError.notFound('Order not found');
  if (order.channel !== 'online' || order.payment_method === 'cod') {
    throw ApiError.conflict('This order is not paid online');
  }
  if (!isAwaitingGatewayPayment(order)) throw ApiError.conflict('This order is no longer awaiting payment');
  if (order.is_expired) throw ApiError.conflict('This order has expired. Please place a new order.');
  // Not enough time left to pay before the reservation lapses.
  if (order.is_closing) throw ApiError.conflict('This order is about to expire. Please place a new order.');

  // Never open a second payment page for an order the gateway already took
  // money for (e.g. our callback was lost).
  const check = await reconcileOrder(order, { source: 'retry', release: 'never', actor: user });
  if (check.gateway === 'unavailable') {
    throw new ApiError(503, 'The payment gateway is unavailable. Please try again in a few minutes.');
  }
  if (check.outcome !== OUTCOME.UNPAID) {
    const now = await query('SELECT status, payment_status FROM orders WHERE id = $1', [order.id]);
    return { order_number: order.order_number, redirect_url: null, ...now.rows[0] };
  }

  const items = await query('SELECT product_name, quantity FROM order_items WHERE order_id = $1 ORDER BY created_at, id', [order.id]);
  let session;
  try {
    session = await sslcommerz.createSession(order, orderService.sessionCustomer({ ...order, _lines: items.rows }, user));
  } catch (err) {
    console.error(`⚠️  SSLCommerz session init failed for ${order.order_number}:`, err.message);
    throw new ApiError(503, 'The payment gateway is unavailable. Please try again in a few minutes.');
  }
  return { order_number: order.order_number, redirect_url: session.gatewayUrl, status: order.status, payment_status: order.payment_status };
};

/**
 * Staff: ask the gateway about an order now and apply the answer (confirm a
 * missed payment, or release an attempt the gateway shows as ended unpaid).
 */
const reconcileForStaff = async (orderId, actor) => {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = rows[0];
  await assertStaffAccess({ query }, actor, order, 'write');
  if (order.channel !== 'online' || order.payment_method === 'cod') {
    throw ApiError.conflict('This order has no online payment to reconcile');
  }

  const result = await reconcileOrder(order, { source: 'staff reconcile', release: 'terminal', reason: 'failed', actor });
  if (result.gateway === 'unavailable') {
    throw new ApiError(503, 'The payment gateway is unavailable. Try again shortly.');
  }
  await audit({
    actor, action: 'order.reconcile', entity: 'order', entityId: order.id,
    data: { outcome: result.outcome, attempts: (result.elements || []).length },
  });
  const now = await query('SELECT status, payment_status FROM orders WHERE id = $1', [order.id]);
  return {
    order_id: order.id,
    order_number: order.order_number,
    outcome: result.outcome,
    ...now.rows[0],
    gateway: (result.elements || []).map(summarizeElement),
  };
};

const GATEWAY_GIVE_UP_HOURS = 24;
// A customer still on the payment page keeps the reservation this much
// longer than reservation_minutes, then it goes regardless.
const OPEN_ATTEMPT_GRACE_MINUTES = 60;

/**
 * Reservation expiry for one order: confirm it if the gateway shows a valid
 * payment, otherwise release it, unless an attempt is still in progress
 * (until reservation_minutes + 60). If the gateway can't be reached, keep the
 * reservation, but not beyond 24h.
 *
 * @param {object} order
 * @param {{ reservationMinutes?: number }} [opts]
 */
const expireOrder = async (order, { reservationMinutes } = {}) => {
  const minutes = reservationMinutes ?? (await settings.getSetting('checkout')).reservation_minutes;
  const { rows } = await query(
    `SELECT created_at < NOW() - make_interval(mins => $2::int) AS past_cap,
            created_at < NOW() - make_interval(hours => $3::int) AS stale
       FROM orders WHERE id = $1`,
    [order.id, minutes + OPEN_ATTEMPT_GRACE_MINUTES, GATEWAY_GIVE_UP_HOURS]
  );
  const { past_cap: pastCap, stale } = rows[0] || {};

  const result = await reconcileOrder(order, {
    source: 'expiry', release: pastCap ? 'always' : 'unless_open', reason: 'expired',
  });
  if (result.gateway !== 'unavailable') return result;
  if (!stale) return result;
  const released = await releaseUnpaidOrder(order.id, {
    reason: 'expired',
    note: `Payment window expired; gateway unreachable for ${GATEWAY_GIVE_UP_HOURS}h, reservation released`,
  });
  return { outcome: released ? OUTCOME.RELEASED : OUTCOME.UNPAID, ref: order.order_number, gateway: 'unavailable' };
};

module.exports = {
  OUTCOME,
  verifyAgainstOrder,
  mapPaymentMethod,
  applyGatewayPayment,
  releaseUnpaidOrder,
  reconcileOrder,
  handleValidatedCallback,
  handleGatewayReturn,
  handleIpn,
  retryPayment,
  reconcileForStaff,
  expireOrder,
  isAwaitingGatewayPayment,
};
