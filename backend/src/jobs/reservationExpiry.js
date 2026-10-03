const { query } = require('../config/database');
const settings = require('../modules/settings/settings.service');
const payments = require('../modules/payments/payment.service');
const orders = require('../modules/orders/order.service');

/**
 * Reservation expiry (BE-04). Every minute, settle online card/mobile-banking
 * orders that are still unpaid after `checkout.reservation_minutes`:
 *   - the gateway shows a valid matching payment → confirm (lost callback)
 *   - an attempt is still in progress → wait, up to reservation_minutes + 60
 *   - otherwise → cancel and release stock + coupon (reason 'expired')
 *   - gateway unreachable → keep the reservation, but release after 24h
 * and COD orders staff haven't confirmed within `checkout.cod_confirm_hours`.
 *
 * Payments held for risk review (payment_status 'processing') are never
 * expired. Each order is re-checked under its row
 * lock before it changes, so this is safe to run alongside payment callbacks
 * (whichever gets the lock first wins; the other sees a settled order).
 * No lock is held across the gateway call.
 */

const BATCH_SIZE = 20;
const MAX_BATCHES_PER_RUN = 10;

const OUTCOME_KEYS = { success: 'confirmed', released: 'released', paid_cancelled: 'confirmed', held: 'held' };

/**
 * One pass over expired reservations. Exported for tests and manual runs.
 *
 * @returns {Promise<{ checked: number, confirmed: number, released: number, held: number, skipped: number, errors: number }>}
 */
const run = async () => {
  const { reservation_minutes: minutes, cod_confirm_hours: codHours } = await settings.getSetting('checkout');
  const summary = { checked: 0, confirmed: 0, released: 0, held: 0, skipped: 0, errors: 0 };
  const seen = [];

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const { rows } = await query(
      `SELECT * FROM orders
        WHERE channel = 'online' AND status = 'pending' AND payment_status = 'pending'
          AND payment_method IS DISTINCT FROM 'cod'
          AND created_at < NOW() - make_interval(mins => $1::int)
          AND NOT (id = ANY($2::uuid[]))
        ORDER BY created_at
        LIMIT $3`,
      [minutes, seen, BATCH_SIZE]
    );
    for (const order of rows) {
      seen.push(order.id);
      summary.checked += 1;
      try {
        const result = await payments.expireOrder(order, { reservationMinutes: minutes });
        summary[OUTCOME_KEYS[result.outcome] || 'skipped'] += 1;
      } catch (err) {
        summary.errors += 1;
        console.error(`⚠️  reservation expiry failed for ${order.order_number}:`, err.message);
      }
    }
    if (rows.length < BATCH_SIZE) break;
  }

  // Unconfirmed COD orders (no gateway involved).
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const { rows } = await query(
      `SELECT id, order_number FROM orders
        WHERE channel = 'online' AND status = 'pending' AND payment_status = 'pending'
          AND payment_method = 'cod'
          AND created_at < NOW() - make_interval(hours => $1::int)
          AND NOT (id = ANY($2::uuid[]))
        ORDER BY created_at
        LIMIT $3`,
      [codHours, seen, BATCH_SIZE]
    );
    for (const order of rows) {
      seen.push(order.id);
      summary.checked += 1;
      try {
        const released = await orders.expireUnconfirmedCod(order.id, { hours: codHours });
        summary[released ? 'released' : 'skipped'] += 1;
      } catch (err) {
        summary.errors += 1;
        console.error(`⚠️  COD expiry failed for ${order.order_number}:`, err.message);
      }
    }
    if (rows.length < BATCH_SIZE) break;
  }
  return summary;
};

module.exports = { name: 'reservation-expiry', intervalMs: 60 * 1000, run };
