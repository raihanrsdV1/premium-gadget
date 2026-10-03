const ApiError = require('../../utils/ApiError');

/**
 * Low-level stock operations shared by inventory, the serial registry and
 * POS. All of them take the transaction client.
 *
 * Model: the fungible `inventory` row (quantity / reserved) is the single
 * source of truth for availability. `available = quantity - reserved`;
 * reserved units are held for pending online orders and are never sold,
 * transferred or adjusted away. Every quantity change writes a
 * stock_movements ledger row.
 *
 * Lock order (avoids deadlocks): orders → inventory rows (by variant_id, or by
 * id when one variant spans two branches) → inventory_units.
 */

/** Append one ledger row. */
const recordMovement = (client, {
  variantId, branchId, unitId = null, type, delta, refType = null, refId = null, userId = null, note = null,
}) =>
  client.query(
    `INSERT INTO stock_movements
       (variant_id, branch_id, unit_id, movement_type, quantity_delta,
        reference_type, reference_id, performed_by, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [variantId, branchId, unitId, type, delta, refType, refId, userId, note]
  );

/**
 * Ledger rows for a line that moved `qty` units, `unitIds` of which are
 * serial-registry units: one ±1 row per unit (so a serial's history is
 * traceable) plus one row for the remainder.
 *
 * @param {number} sign - +1 (stock in) or -1 (stock out)
 */
const recordLineMovements = async (client, { qty, unitIds = [], sign, ...rest }) => {
  for (const unitId of unitIds) {
    await recordMovement(client, { ...rest, unitId, delta: sign });
  }
  const remainder = qty - unitIds.length;
  if (remainder > 0) await recordMovement(client, { ...rest, delta: sign * remainder });
};

/** Add `qty` to a branch's stock, creating the inventory row if needed. */
const addStock = async (client, { variantId, branchId, qty }) => {
  const { rows } = await client.query(
    `INSERT INTO inventory (variant_id, branch_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (variant_id, branch_id)
     DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
     RETURNING *`,
    [variantId, branchId, qty]
  );
  return rows[0];
};

/**
 * Take `qty` sellable units. Succeeds only when quantity - reserved >= qty, so
 * units held for pending online orders can't be sold or moved (BE-01). The
 * conditional UPDATE is atomic: concurrent callers serialize on the row lock
 * and re-check the condition.
 *
 * @returns {Promise<object|null>} the updated row, or null if not enough stock
 */
const takeAvailable = async (client, { variantId, branchId, qty }) => {
  const { rows } = await client.query(
    `UPDATE inventory SET quantity = quantity - $1
      WHERE variant_id = $2 AND branch_id = $3 AND quantity - reserved >= $1
      RETURNING *`,
    [qty, variantId, branchId]
  );
  return rows[0] || null;
};

/** Current availability (for error messages). */
const availableAt = async (client, { variantId, branchId }) => {
  const { rows } = await client.query(
    'SELECT GREATEST(quantity - reserved, 0)::int AS n FROM inventory WHERE variant_id = $1 AND branch_id = $2',
    [variantId, branchId]
  );
  return rows[0]?.n ?? 0;
};

/** 400 unless the branch exists and is active. */
const assertActiveBranch = async (db, branchId) => {
  const { rows } = await db.query('SELECT id, name, is_active FROM branches WHERE id = $1', [branchId]);
  if (!rows.length) throw ApiError.badRequest('Branch not found');
  if (!rows[0].is_active) throw ApiError.badRequest('Branch is inactive');
  return rows[0];
};

/** 400 unless the variant exists on a non-deleted product. */
const assertVariant = async (db, variantId) => {
  const { rows } = await db.query(
    `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1 AND p.deleted_at IS NULL`,
    [variantId]
  );
  if (!rows.length) throw ApiError.badRequest('Product variant not found');
  return rows[0];
};

module.exports = {
  recordMovement,
  recordLineMovements,
  addStock,
  takeAvailable,
  availableAt,
  assertActiveBranch,
  assertVariant,
};
