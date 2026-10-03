/**
 * Shared fixtures for the operations suites (branches, inventory, POS,
 * repairs, reviews, staff).
 */
const { api, query, factories: f } = require('../helpers');

/**
 * Two branches, a branch_admin for each, a super_admin without a branch and a
 * customer. Returns { branchA, branchB, sa, adminA, adminB, customer } where
 * each user entry is { user, token }.
 */
const world = async () => {
  const branchA = await f.branch({ name: 'Agrabad' });
  const branchB = await f.branch({ name: 'GEC Circle' });
  const sa = await f.user({ role: 'super_admin', full_name: 'Super Admin' });
  const adminA = await f.user({ role: 'branch_admin', branch_id: branchA.id, full_name: 'Alam Admin' });
  const adminB = await f.user({ role: 'branch_admin', branch_id: branchB.id, full_name: 'Bashir Admin' });
  const customer = await f.user({ full_name: 'Karim Uddin' });
  return { branchA, branchB, sa, adminA, adminB, customer };
};

/** Insert a coupon directly (the coupon admin API belongs to another module). */
const coupon = async (overrides = {}) => {
  const { rows } = await query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_uses,
                          valid_from, valid_until, is_active, max_discount, per_user_limit, channel)
     VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', $6, $7, $8, $9)
     RETURNING *`,
    [
      overrides.code || `SAVE${Math.floor(Math.random() * 1e6)}`,
      overrides.discount_type || 'percentage',
      overrides.discount_value ?? 10,
      overrides.min_order_value ?? 0,
      overrides.max_uses ?? null,
      overrides.is_active ?? true,
      overrides.max_discount ?? null,
      overrides.per_user_limit ?? null,
      overrides.channel || 'all',
    ]
  );
  return rows[0];
};

/** reserved ≤ quantity and nothing negative, across every stock row. */
const expectStockInvariants = async () => {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM inventory WHERE reserved > quantity OR quantity < 0 OR reserved < 0'
  );
  expect(rows[0].n).toBe(0);
};

/** Sum of ledger deltas (excluding online reservation bookkeeping). */
const ledgerSum = async (variantId, branchId) => {
  const { rows } = await query(
    `SELECT COALESCE(SUM(quantity_delta), 0)::int AS n FROM stock_movements
      WHERE variant_id = $1 AND branch_id = $2 AND movement_type NOT IN ('reservation', 'release')`,
    [variantId, branchId]
  );
  return rows[0].n;
};

/**
 * Staff-only endpoints: anonymous → 401, customer → 403.
 * @param {Array<[string, string, object?]>} endpoints - [method, path, body]
 */
const expectStaffOnly = async (endpoints, customerToken) => {
  for (const [method, path, body] of endpoints) {
    const anon = await api[method](path).send(body);
    expect([method, path, anon.status]).toEqual([method, path, 401]);
    const cust = await api[method](path).set(f.auth(customerToken)).send(body);
    expect([method, path, cust.status]).toEqual([method, path, 403]);
  }
};

const auditCount = async (action, entityId) => {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE action = $1 AND ($2::uuid IS NULL OR entity_id = $2)',
    [action, entityId || null]
  );
  return rows[0].n;
};

module.exports = { world, coupon, expectStockInvariants, ledgerSum, expectStaffOnly, auditCount };
