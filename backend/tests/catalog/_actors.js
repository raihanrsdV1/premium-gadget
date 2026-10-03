/**
 * Shared setup for catalog tests: one user per role for the authz matrix.
 * Not a test file (no .test.js suffix).
 */
const { factories: f, query } = require('../helpers');

const actors = async () => {
  const branch = await f.branch({ name: 'Agrabad' });
  const otherBranch = await f.branch({ name: 'GEC' });
  const sa = await f.user({ role: 'super_admin' });
  const ba = await f.user({ role: 'branch_admin', branch_id: branch.id });
  const baOther = await f.user({ role: 'branch_admin', branch_id: otherBranch.id });
  const cust = await f.user();
  return {
    branch,
    otherBranch,
    sa: f.auth(sa.token),
    ba: f.auth(ba.token),
    baOther: f.auth(baOther.token),
    cust: f.auth(cust.token),
    users: { sa: sa.user, ba: ba.user, baOther: baOther.user, cust: cust.user },
  };
};

/** Audit rows for an entity id. */
const auditFor = async (entityId) =>
  (await query('SELECT action, actor_id, data FROM admin_audit_log WHERE entity_id = $1 ORDER BY created_at', [entityId])).rows;

/** Place a minimal order line for a variant (to make it "referenced by orders"). */
const orderLine = async (variantId, userId) => {
  const { rows } = await query(
    `INSERT INTO orders (order_number, user_id, subtotal, total_amount)
     VALUES ($1, $2, 1000, 1000) RETURNING id`,
    [`T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId || null]
  );
  await query(
    `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price)
     VALUES ($1, $2, 1, 1000, 1000)`,
    [rows[0].id, variantId]
  );
  return rows[0].id;
};

module.exports = { actors, auditFor, orderLine };
