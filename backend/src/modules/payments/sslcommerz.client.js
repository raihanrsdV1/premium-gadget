const SSLCommerzPayment = require('sslcommerz-lts');
const config = require('../../config');

const { storeId, storePassword, isSandbox } = config.sslcommerz;
const { serverPublic } = config.urls;

function client() {
  // is_live = !sandbox
  return new SSLCommerzPayment(storeId, storePassword, !isSandbox);
}

// SSLCommerz expects plain-text fields; characters like quotes/backslashes
// corrupt the init request (e.g. a product named `MacBook Pro M3 14"` makes
// the gateway return no GatewayPageURL). Strip them and clamp length.
function clean(value, maxLen = 100) {
  const s = String(value ?? '')
    .replace(/["'\\]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || 'NA';
}

/**
 * Create a payment session for an order and return the gateway redirect URL.
 * `value_a` carries the order id so the success/fail/cancel callbacks can
 * locate the order.
 *
 * @returns {Promise<{ gatewayUrl: string, raw: object }>}
 */
async function createSession(order, customer) {
  const data = {
    total_amount: Number(order.total_amount),
    currency: 'BDT',
    tran_id: order.order_number,
    success_url: `${serverPublic}/payments/success`,
    fail_url: `${serverPublic}/payments/fail`,
    cancel_url: `${serverPublic}/payments/cancel`,
    ipn_url: `${serverPublic}/payments/ipn`,
    shipping_method: 'Courier',
    product_name: clean(customer.productSummary || 'Premium Gadget Order', 255),
    product_category: 'Electronics',
    product_profile: 'general',
    cus_name: clean(customer.name || 'Customer'),
    cus_email: clean(customer.email || 'customer@premiumgadget.com', 120),
    cus_add1: clean(customer.address || 'N/A', 120),
    cus_city: clean(customer.city || 'Dhaka', 60),
    cus_postcode: '1200',
    cus_country: 'Bangladesh',
    cus_phone: clean(customer.phone || '01700000000', 20),
    ship_name: clean(customer.name || 'Customer'),
    ship_add1: clean(customer.address || 'N/A', 120),
    ship_city: clean(customer.city || 'Dhaka', 60),
    ship_postcode: '1200',
    ship_country: 'Bangladesh',
    value_a: order.id,
    num_of_item: customer.numItems || 1,
  };

  const apiResponse = await client().init(data);
  if (!apiResponse || !apiResponse.GatewayPageURL) {
    throw new Error(
      `SSLCommerz init failed: ${apiResponse?.failedreason || 'no GatewayPageURL returned'}`
    );
  }
  return { gatewayUrl: apiResponse.GatewayPageURL, raw: apiResponse };
}

/**
 * Validate a settled transaction with SSLCommerz (server-to-server) using the
 * val_id from the success callback. Never trust the redirect alone.
 *
 * @returns {Promise<object>} validation response ({ status, amount, tran_id, ... })
 */
async function validatePayment(valId) {
  return client().validate({ val_id: valId });
}

module.exports = { createSession, validatePayment };
