/**
 * Commerce test helpers: a small shop (branch + product + stock), customers,
 * checkout, and gateway callbacks. Pair with ./_gateway (mocked SSLCommerz).
 */
const { api, query, resetDb, factories: f } = require('../helpers');
const settings = require('../../src/modules/settings/settings.service');
const gw = require('./_gateway');

const ADDRESS = {
  full_name: 'Rahim Uddin',
  phone: '01711000111',
  division: 'Chattogram',
  district: 'Chattogram',
  street: 'House 12, Road 4, Banani',
};

const reset = async () => {
  await resetDb();
  settings._clearCache();
  gw.reset();
};

/**
 * A branch with one product variant in stock.
 * @returns {Promise<{ branch, product, variant }>}
 */
const shop = async ({ price = 50000, quantity = 5, reserved = 0, branch } = {}) => {
  const b = branch || (await f.branch());
  const { product, variants } = await f.product({
    variants: [{ price, stock: [{ branch_id: b.id, quantity, reserved }] }],
  });
  return { branch: b, product, variant: variants[0] };
};

/** Extra variant (with stock at the given branch). */
const variantAt = async (branchId, { price = 20000, quantity = 5 } = {}) => {
  const { variants } = await f.product({ variants: [{ price, stock: [{ branch_id: branchId, quantity }] }] });
  return variants[0];
};

const checkoutBody = (variant, overrides = {}) => ({
  items: [{ variant_id: variant.id, quantity: 1 }],
  shipping_method: 'inside_chattogram',
  shipping_address: ADDRESS,
  ...overrides,
});

/** POST /orders/checkout as `token`. Returns the supertest response. */
const checkout = (token, body) => api.post('/api/v1/orders/checkout').set(f.auth(token)).send(body);

/** Place an order and assert 201; returns response data. */
const placeOrder = async (token, variant, overrides = {}) => {
  const res = await checkout(token, checkoutBody(variant, overrides));
  if (res.status !== 201) throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

const success = (body) => api.post('/api/v1/payments/success').type('form').send(body);
const fail = (body) => api.post('/api/v1/payments/fail').type('form').send(body);
const cancel = (body) => api.post('/api/v1/payments/cancel').type('form').send(body);
const ipn = (body) => api.post('/api/v1/payments/ipn').type('form').send(body);

const orderRow = async (id) => (await query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
const txRows = async (orderId) =>
  (await query('SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at', [orderId])).rows;
const stock = (variantId, branchId) => f.stock(variantId, branchId);

/** Pretend the order was placed `minutes` ago. */
const age = (orderId, minutes) =>
  query(`UPDATE orders SET created_at = NOW() - make_interval(mins => $2::int) WHERE id = $1`, [orderId, minutes]);

const setSetting = (key, value) =>
  query(
    `INSERT INTO site_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  ).then(() => settings._clearCache());

const staff = async () => {
  const branch = await f.branch();
  const other = await f.branch();
  const admin = await f.user({ role: 'super_admin' });
  const manager = await f.user({ role: 'branch_admin', branch_id: branch.id });
  const outsider = await f.user({ role: 'branch_admin', branch_id: other.id });
  return { branch, other, admin, manager, outsider };
};

module.exports = {
  ADDRESS, reset, shop, variantAt, checkoutBody, checkout, placeOrder,
  success, fail, cancel, ipn, orderRow, txRows, stock, age, setSetting, staff,
};
