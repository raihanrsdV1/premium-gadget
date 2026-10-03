/**
 * Shared fixtures for the Phase 3 tests (collections, badges, permissions,
 * navigation). Not a test file (no .test.js suffix).
 */
const { query, factories: f } = require('../helpers');

const DAY = 24 * 3600 * 1000;
const past = (days = 2) => new Date(Date.now() - days * DAY).toISOString();
const future = (days = 2) => new Date(Date.now() + days * DAY).toISOString();

let n = 0;
/** Insert a collection directly (bypassing the API). */
const collection = async (fields = {}) => {
  n += 1;
  const row = { name: `Collection ${n}`, slug: `collection-${n}`, ...fields };
  const keys = Object.keys(row);
  const { rows } = await query(
    `INSERT INTO collections (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    keys.map((k) => row[k])
  );
  return rows[0];
};

/** Put products into a manual collection, in the given order. */
const addMembers = async (collectionId, productIds) => {
  for (const [i, id] of productIds.entries()) {
    await query('INSERT INTO collection_products (collection_id, product_id, sort_order) VALUES ($1, $2, $3)', [collectionId, id, i]);
  }
};

/** An in-stock product (cheap to create; returns { product, variant }). */
const stocked = async (overrides = {}) => {
  const branch = overrides.branch || (await f.branch());
  const { product, variants } = await f.product({
    name: overrides.name,
    category_id: overrides.category_id,
    brand_id: overrides.brand_id,
    is_featured: overrides.is_featured,
    is_active: overrides.is_active,
    variants: [{ price: overrides.price ?? 50000, compare_at_price: overrides.compare_at_price, stock: [{ branch_id: branch.id, quantity: overrides.quantity ?? 5 }] }],
  });
  if (overrides.created_days_ago != null) {
    await query("UPDATE products SET created_at = NOW() - make_interval(days => $2::int) WHERE id = $1", [product.id, overrides.created_days_ago]);
  }
  return { product, variant: variants[0], branch };
};

/** An order with one line (bypassing checkout): online by default, `pos` for walk-in sales. */
const sell = async ({ variant, qty = 1, status = 'confirmed', channel = 'online', voided = false, daysAgo = 0 }) => {
  const { rows } = await query(
    `INSERT INTO orders (order_number, subtotal, total_amount, status, channel, voided_at, created_at)
     VALUES ($1, 1000, 1000, $2::order_status, $3::sale_channel, $4, NOW() - make_interval(days => $5::int))
     RETURNING id`,
    [`T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status, channel, voided ? new Date() : null, daysAgo]
  );
  await query(
    'INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, 1000, $4)',
    [rows[0].id, variant.id, qty, 1000 * qty]
  );
  return rows[0].id;
};

/** One user per role for the authz matrix. */
const actors = async () => {
  const branch = await f.branch({ name: 'Agrabad' });
  const sa = await f.user({ role: 'super_admin' });
  const ba = await f.user({ role: 'branch_admin', branch_id: branch.id });
  const cust = await f.user();
  return {
    branch,
    sa: f.auth(sa.token),
    ba: f.auth(ba.token),
    cust: f.auth(cust.token),
    users: { sa: sa.user, ba: ba.user, cust: cust.user },
  };
};

module.exports = { DAY, past, future, collection, addMembers, stocked, sell, actors };
