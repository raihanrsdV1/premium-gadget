/**
 * Gateway pieces shared by the SSLCommerz client, payment service and
 * validation. Kept out of sslcommerz.client.js so tests that jest.mock the
 * client still get the real error class and identifier rule.
 */

/** Shape of every gateway identifier we send or accept (val_id, tran_id). */
const GATEWAY_ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * The payment gateway could not give a trustworthy answer: network error,
 * timeout, non-2xx, unparseable body, or our store credentials were refused.
 *
 * Callers must treat this as "unknown", never as "not paid": the order stays
 * pending and is reconciled later (expiry job / staff reconcile).
 */
class GatewayUnavailableError extends Error {
  constructor(message = 'Payment gateway unavailable', cause) {
    super(message);
    this.name = 'GatewayUnavailableError';
    this.code = 'GATEWAY_UNAVAILABLE';
    if (cause) this.cause = cause;
  }
}

/** Duck-typed so it survives jest module-registry resets. */
const isGatewayUnavailable = (err) => Boolean(err && err.code === 'GATEWAY_UNAVAILABLE');

module.exports = { GATEWAY_ID, GatewayUnavailableError, isGatewayUnavailable };
