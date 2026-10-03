const config = require('../../config');
const { GATEWAY_ID, GatewayUnavailableError, isGatewayUnavailable } = require('./gateway.shared');

/**
 * Minimal SSLCommerz client (session init, payment validation, transaction
 * query) on Node's global fetch.
 *
 * We don't use the sslcommerz-lts library for any of this because it
 *   - builds query strings by concatenation, so a crafted val_id such as
 *     `x&store_id=evil&store_passwd=evil#` re-points validation at an
 *     attacker's store (SEC-02);
 *   - turns network errors into a resolved value (`.catch(err => err)`), which
 *     callers then read as "invalid payment" and cancel paid orders (BE-02);
 *   - has no timeout.
 *
 * Every request here uses URL + URLSearchParams, a 10s timeout, and throws
 * GatewayUnavailableError whenever the answer can't be trusted.
 */

const BASE_URLS = {
  sandbox: 'https://sandbox.sslcommerz.com',
  live: 'https://securepay.sslcommerz.com',
};
const PATHS = {
  init: '/gwprocess/v4/api.php',
  validation: '/validator/api/validationserverAPI.php',
  query: '/validator/api/merchantTransIDvalidationAPI.php',
};
const TIMEOUT_MS = 10000;

const baseUrl = () => (config.sslcommerz.isSandbox ? BASE_URLS.sandbox : BASE_URLS.live);

const endpoint = (path) => new URL(path, baseUrl());

const credentials = () => ({
  store_id: String(config.sslcommerz.storeId || ''),
  store_passwd: String(config.sslcommerz.storePassword || ''),
});

const assertGatewayId = (value, field) => {
  if (typeof value !== 'string' || !GATEWAY_ID.test(value)) {
    const err = new Error(`Invalid ${field}`);
    err.code = 'INVALID_GATEWAY_ID';
    throw err;
  }
};

/**
 * Perform a request and return the parsed JSON object. Anything other than a
 * 2xx JSON object is a GatewayUnavailableError. The URL is never logged: it
 * carries the store password.
 */
const requestJson = async (url, init = {}) => {
  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const what = err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timed out' : 'failed';
    throw new GatewayUnavailableError(`SSLCommerz request ${what}`, err);
  }
  if (!res.ok) throw new GatewayUnavailableError(`SSLCommerz responded HTTP ${res.status}`);

  let data;
  try {
    data = JSON.parse(await res.text());
  } catch (err) {
    throw new GatewayUnavailableError('SSLCommerz returned an invalid response', err);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new GatewayUnavailableError('SSLCommerz returned an invalid response');
  }
  return data;
};

/**
 * The validation and query APIs report their own health in APIConnect. Only
 * DONE means the answer is about our payment: FAILED (credentials refused),
 * INACTIVE (store disabled), INVALID_REQUEST or a missing field mean we
 * learned nothing, which must never be read as "not paid".
 */
const assertApiConnected = (data) => {
  const apiConnect = String(data.APIConnect ?? '').toUpperCase();
  if (apiConnect !== 'DONE') {
    throw new GatewayUnavailableError(`SSLCommerz API connection ${apiConnect || 'missing'}`);
  }
};

// SSLCommerz expects plain-text fields; characters like quotes/backslashes
// corrupt the init request (e.g. a product named `MacBook Pro M3 14"` makes
// the gateway return no GatewayPageURL). Strip them and clamp length.
const clean = (value, maxLen = 50) => {
  const s = String(value ?? '')
    .replace(/["'\\<>]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || 'NA';
};

// Only ever send the browser to the gateway's own hosted page.
const isGatewayPageUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && (u.hostname === 'sslcommerz.com' || u.hostname.endsWith('.sslcommerz.com'));
  } catch {
    return false;
  }
};

/**
 * Create a hosted payment session for an order.
 * tran_id = order_number and value_a = order id; both are checked against the
 * gateway's own validation response before any order is confirmed.
 *
 * @param {{ id: string, order_number: string, total_amount: number|string }} order
 * @param {{ name?, email?, phone?, address?, city?, postcode?, numItems?, productSummary? }} customer
 * @returns {Promise<{ gatewayUrl: string, sessionKey: string|null }>}
 * @throws {GatewayUnavailableError}
 */
const createSession = async (order, customer = {}) => {
  assertGatewayId(order.order_number, 'tran_id');
  const { serverPublic } = config.urls;
  const body = new URLSearchParams({
    ...credentials(),
    total_amount: Number(order.total_amount).toFixed(2),
    currency: 'BDT',
    tran_id: order.order_number,
    success_url: `${serverPublic}/payments/success`,
    fail_url: `${serverPublic}/payments/fail`,
    cancel_url: `${serverPublic}/payments/cancel`,
    ipn_url: `${serverPublic}/payments/ipn`,
    shipping_method: 'Courier',
    num_of_item: String(customer.numItems || 1),
    product_name: clean(customer.productSummary || 'Premium Gadget Order', 255),
    product_category: 'Electronics',
    product_profile: 'general',
    cus_name: clean(customer.name || 'Customer'),
    cus_email: clean(customer.email || 'customer@premiumgadget.com.bd'),
    cus_add1: clean(customer.address || 'N/A'),
    cus_city: clean(customer.city || 'Chattogram'),
    cus_postcode: clean(customer.postcode || '4000', 10),
    cus_country: 'Bangladesh',
    cus_phone: clean(customer.phone || '01700000000', 20),
    ship_name: clean(customer.name || 'Customer'),
    ship_add1: clean(customer.address || 'N/A'),
    ship_city: clean(customer.city || 'Chattogram'),
    ship_postcode: clean(customer.postcode || '4000', 10),
    ship_country: 'Bangladesh',
    value_a: order.id,
  });

  const data = await requestJson(endpoint(PATHS.init), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (String(data.status).toUpperCase() !== 'SUCCESS' || !isGatewayPageUrl(data.GatewayPageURL)) {
    // failedreason can echo our request; keep it out of client responses.
    throw new GatewayUnavailableError(`SSLCommerz session init failed: ${String(data.failedreason || 'no GatewayPageURL').slice(0, 200)}`);
  }
  return { gatewayUrl: data.GatewayPageURL, sessionKey: data.sessionkey || null };
};

/**
 * Ask the gateway about a payment by its val_id (server-to-server). The
 * result is the gateway's own record: status, tran_id, value_a, amount,
 * currency_type, risk_level, ...
 *
 * @param {string} valId
 * @returns {Promise<object>}
 * @throws {GatewayUnavailableError} gateway unreachable / untrustworthy answer
 * @throws {Error} code INVALID_GATEWAY_ID before any network call
 */
const validatePayment = async (valId) => {
  assertGatewayId(valId, 'val_id');
  const url = endpoint(PATHS.validation);
  url.search = new URLSearchParams({ val_id: valId, ...credentials(), v: '1', format: 'json' }).toString();
  const data = await requestJson(url, { method: 'GET' });
  assertApiConnected(data);
  return data;
};

/**
 * List every payment attempt the gateway has for our tran_id (= order number).
 * "No attempts" is returned only when the gateway explicitly says so
 * (no_of_trans_found = 0); any other shape without an element list, or an
 * element that isn't an object, is GatewayUnavailableError.
 *
 * @param {string} tranId
 * @returns {Promise<{ elements: object[], raw: object }>}
 * @throws {GatewayUnavailableError}
 */
const queryByTranId = async (tranId) => {
  assertGatewayId(tranId, 'tran_id');
  const url = endpoint(PATHS.query);
  url.search = new URLSearchParams({ tran_id: tranId, ...credentials(), v: '1', format: 'json' }).toString();
  const data = await requestJson(url, { method: 'GET' });
  assertApiConnected(data);
  const isRecord = (e) => Boolean(e) && typeof e === 'object' && !Array.isArray(e);
  if (Array.isArray(data.element)) {
    if (!data.element.every(isRecord)) throw new GatewayUnavailableError('SSLCommerz returned malformed transactions');
    return { elements: data.element, raw: data };
  }
  const found = data.no_of_trans_found;
  if ((found === 0 || found === '0') && (data.element === undefined || data.element === null)) {
    return { elements: [], raw: data };
  }
  throw new GatewayUnavailableError('SSLCommerz returned no transaction list');
};

module.exports = {
  createSession,
  validatePayment,
  queryByTranId,
  GatewayUnavailableError,
  isGatewayUnavailable,
  GATEWAY_ID,
  BASE_URLS,
  PATHS,
  TIMEOUT_MS,
};
