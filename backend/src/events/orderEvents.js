/**
 * In-process order event bus (Node EventEmitter singleton).
 *
 * Events
 *   'order.status_changed'  { order, from, to, actor }
 *       order  the order row AFTER the change (internal — may include admin_note)
 *       from   previous status, or null when the order was just created
 *       to     new status
 *       actor  { id, role } of the staff member / customer, or null for
 *              system actions (gateway callbacks, the expiry job)
 *
 * Emitted only AFTER the database transaction commits, so listeners never see
 * a change that was rolled back.
 *
 * This is the integration point for a future courier service (Pathao,
 * Steadfast, RedX): subscribe to `to === 'confirmed'` / `'processing'` to book
 * a pickup, `'cancelled'` to cancel it, and write tracking numbers back via
 * PATCH /orders/:id/status (status 'shipped'). SMS/email notifications belong
 * here too.
 *
 *   const orderEvents = require('../events/orderEvents');
 *   orderEvents.on(orderEvents.STATUS_CHANGED, async ({ order, to }) => { ... });
 *
 * Listener failures (sync throws or rejected promises) are logged and
 * swallowed: a broken integration must never fail the request or payment
 * callback that triggered it. Listeners run synchronously in emit order, so
 * keep them quick and push slow work into the promise they return.
 */
const { EventEmitter } = require('events');

const STATUS_CHANGED = 'order.status_changed';

const logListenerError = (event, err) => {
  console.error(`⚠️  ${event} listener failed:`, err && err.message ? err.message : err);
};

class SafeEmitter extends EventEmitter {
  emit(event, ...args) {
    const listeners = this.rawListeners(event);
    if (!listeners.length) return false;
    for (const listener of listeners) {
      try {
        const result = listener.apply(this, args);
        if (result && typeof result.then === 'function') {
          result.then(null, (err) => logListenerError(event, err));
        }
      } catch (err) {
        logListenerError(event, err);
      }
    }
    return true;
  }
}

const orderEvents = new SafeEmitter();
orderEvents.setMaxListeners(50);
orderEvents.STATUS_CHANGED = STATUS_CHANGED;

module.exports = orderEvents;
