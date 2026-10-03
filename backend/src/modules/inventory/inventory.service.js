const { afterStockChange } = require('../../lib/stockRevalidation');
const crypto = require('crypto');
const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { escapeLike } = require('../../utils/validators');
const { effectivePriceSql } = require('../../utils/pricing');
const { audit } = require('../../utils/audit');
const {
  isSuperAdmin, sameId, listBranchScope, writeBranchScope, assertBranchAccess, addDateRange,
} = require('../branches/ops.shared');
const {
  recordMovement, recordLineMovements, addStock, assertActiveBranch, assertVariant,
} = require('./inventory.stock');

/**
 * Inventory (staff only). Stock rows are per variant per branch; a
 * branch_admin only sees and changes their own branch. Every quantity change
 * is guarded so `quantity` never drops below `reserved` (units held for
 * pending online orders) and is written to the stock_movements ledger.
 */

const NOT_FOUND = 'Inventory record not found';

// Staff-only view: includes cost_price.
const ROW_SELECT = `
  SELECT i.id, i.variant_id, i.branch_id, b.name AS branch_name,
         pv.product_id, p.name AS product_name, p.slug AS product_slug,
         (p.is_active AND p.deleted_at IS NULL AND pv.is_active) AS sellable_online,
         pv.variant_name, pv.sku,
         i.quantity, i.reserved, (i.quantity - i.reserved) AS available,
         i.low_stock_threshold,
         (i.quantity - i.reserved) <= i.low_stock_threshold AS is_low_stock,
         ${effectivePriceSql('pv')} AS price, pv.price AS regular_price, pv.cost_price,
         i.updated_at
    FROM inventory i
    JOIN product_variants pv ON pv.id = i.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN branches b ON b.id = i.branch_id`;

const fetchRow = async (db, id) => {
  const { rows } = await db.query(`${ROW_SELECT} WHERE i.id = $1`, [id]);
  return rows[0] || null;
};

/** Lock an inventory row and check the caller may touch it (404 otherwise). */
const lockRow = async (client, id, user) => {
  const { rows } = await client.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [id]);
  const row = rows[0];
  if (!row) throw ApiError.notFound(NOT_FOUND);
  assertBranchAccess(user, row.branch_id, NOT_FOUND);
  return row;
};

const belowReserved = (reserved) =>
  ApiError.conflict(`Stock can't go below the ${reserved} unit(s) reserved for pending online orders`);

/** Paginated stock list with product/variant/branch details. */
const getAll = async (q, user) => {
  const { page, limit, offset } = parsePagination(q);
  const where = ['TRUE'];
  const params = [];
  const branchId = listBranchScope(user, q.branch_id);
  if (branchId) {
    params.push(branchId);
    where.push(`i.branch_id = $${params.length}`);
  }
  if (q.product_id) {
    params.push(q.product_id);
    where.push(`pv.product_id = $${params.length}`);
  }
  if (q.variant_id) {
    params.push(q.variant_id);
    where.push(`i.variant_id = $${params.length}`);
  }
  if (q.q) {
    params.push(`%${escapeLike(q.q)}%`);
    const n = params.length;
    where.push(`(p.name ILIKE $${n} OR pv.sku ILIKE $${n} OR pv.variant_name ILIKE $${n})`);
  }
  if (q.low_stock === true) where.push('(i.quantity - i.reserved) <= i.low_stock_threshold');
  if (q.low_stock === false) where.push('(i.quantity - i.reserved) > i.low_stock_threshold');

  const whereSql = where.join(' AND ');
  const from = `FROM inventory i
    JOIN product_variants pv ON pv.id = i.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN branches b ON b.id = i.branch_id`;
  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n ${from} WHERE ${whereSql}`, params),
    query(
      `${ROW_SELECT} WHERE ${whereSql}
        ORDER BY p.name ASC, pv.variant_name ASC, b.sort_order ASC, b.name ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/** One stock row plus the serial-registry units in stock there. */
const getById = async (id, user) => {
  const row = await fetchRow({ query }, id);
  if (!row) throw ApiError.notFound(NOT_FOUND);
  assertBranchAccess(user, row.branch_id, NOT_FOUND);
  const units = await query(
    `SELECT id, serial_number, condition_grade, battery_health, cosmetic_notes,
            cost_price, listed_price, notes, status, received_at
       FROM inventory_units
      WHERE variant_id = $1 AND branch_id = $2 AND status = 'in_stock'
      ORDER BY received_at ASC`,
    [row.variant_id, row.branch_id]
  );
  return { ...row, units: units.rows };
};

/** Start tracking a variant at a branch. 409 if a row already exists. */
const create = async (data, user) => {
  const branchId = writeBranchScope(user, data.branch_id);
  if (!branchId) throw ApiError.badRequest('branch_id is required');

  const id = await withTransaction(async (client) => {
    await assertActiveBranch(client, branchId);
    await assertVariant(client, data.variant_id);
    const { rows } = await client.query(
      `INSERT INTO inventory (variant_id, branch_id, quantity, low_stock_threshold)
       VALUES ($1, $2, $3, COALESCE($4, 5))
       ON CONFLICT (variant_id, branch_id) DO NOTHING
       RETURNING id`,
      [data.variant_id, branchId, data.quantity, data.low_stock_threshold ?? null]
    );
    if (!rows.length) {
      throw ApiError.conflict('This variant is already stocked at this branch — adjust the existing record instead');
    }
    if (data.quantity > 0) {
      await recordMovement(client, {
        variantId: data.variant_id, branchId, type: 'initial', delta: data.quantity,
        refType: 'manual', userId: user.id, note: data.note ?? null,
      });
    }
    await audit({
      actor: user, action: 'inventory.create', entity: 'inventory', entityId: rows[0].id,
      data: { variant_id: data.variant_id, branch_id: branchId, quantity: data.quantity }, db: client,
    });
    return rows[0].id;
  });
  return fetchRow({ query }, id);
};

/**
 * Stock count: set the absolute on-hand quantity (and/or the low-stock
 * threshold). The difference is recorded as an 'adjustment'.
 */
const update = async (id, data, user) => {
  await withTransaction(async (client) => {
    const current = await lockRow(client, id, user);
    if (data.quantity !== undefined && data.quantity < current.reserved) throw belowReserved(current.reserved);

    await client.query(
      `UPDATE inventory
          SET quantity = COALESCE($1, quantity),
              low_stock_threshold = COALESCE($2, low_stock_threshold)
        WHERE id = $3`,
      [data.quantity ?? null, data.low_stock_threshold ?? null, id]
    );

    const delta = data.quantity === undefined ? 0 : data.quantity - current.quantity;
    if (delta !== 0) {
      await recordMovement(client, {
        variantId: current.variant_id, branchId: current.branch_id, type: 'adjustment', delta,
        refType: 'manual', userId: user.id, note: data.note ?? null,
      });
    }
    await audit({
      actor: user, action: 'inventory.update', entity: 'inventory', entityId: id,
      data: {
        quantity: data.quantity === undefined ? undefined : { from: current.quantity, to: data.quantity },
        low_stock_threshold: data.low_stock_threshold,
        note: data.note,
      },
      db: client,
    });
  });
  return fetchRow({ query }, id);
};

// Ledger movement type for each adjustment reason.
const ADJUST_MOVEMENT = {
  received: 'received',
  damaged: 'damaged',
  lost: 'lost',
  correction: 'correction',
  returned: 'return',
  other: 'adjustment',
};

/** Relative adjustment with a reason. Can't take stock below `reserved`. */
const adjust = async (id, data, user) => {
  await withTransaction(async (client) => {
    const current = await lockRow(client, id, user);
    const next = current.quantity + data.delta;
    if (next < 0) throw ApiError.conflict(`Only ${current.quantity} unit(s) on hand`);
    if (next < current.reserved) throw belowReserved(current.reserved);

    await client.query('UPDATE inventory SET quantity = $1 WHERE id = $2', [next, id]);
    await recordMovement(client, {
      variantId: current.variant_id, branchId: current.branch_id, type: ADJUST_MOVEMENT[data.reason],
      delta: data.delta, refType: 'manual', userId: user.id, note: data.note ?? null,
    });
    await audit({
      actor: user, action: 'inventory.adjust', entity: 'inventory', entityId: id,
      data: { delta: data.delta, reason: data.reason, from: current.quantity, to: next, note: data.note },
      db: client,
    });
  });
  return fetchRow({ query }, id);
};

/**
 * Move available stock between branches atomically. Both rows are locked in
 * id order so two opposite transfers can't deadlock; the destination row is
 * created if missing. A branch_admin may only send stock out of their branch.
 */
const transfer = async (data, user) => {
  if (!isSuperAdmin(user)) {
    if (!user.branch_id || !sameId(data.from_branch_id, user.branch_id)) {
      throw ApiError.forbidden('You can only transfer stock out of your own branch');
    }
  }
  const unitIds = data.unit_ids || [];

  return withTransaction(async (client) => {
    await assertVariant(client, data.variant_id);
    await assertActiveBranch(client, data.to_branch_id);

    await client.query(
      `INSERT INTO inventory (variant_id, branch_id, quantity) VALUES ($1, $2, 0)
       ON CONFLICT (variant_id, branch_id) DO NOTHING`,
      [data.variant_id, data.to_branch_id]
    );
    const { rows } = await client.query(
      `SELECT * FROM inventory
        WHERE variant_id = $1 AND branch_id = ANY($2::uuid[])
        ORDER BY id
        FOR UPDATE`,
      [data.variant_id, [data.from_branch_id, data.to_branch_id]]
    );
    const src = rows.find((r) => sameId(r.branch_id, data.from_branch_id));
    const dst = rows.find((r) => sameId(r.branch_id, data.to_branch_id));
    const available = src ? src.quantity - src.reserved : 0;
    if (available < data.quantity) {
      throw ApiError.conflict(`Only ${Math.max(available, 0)} unit(s) available to transfer`);
    }

    if (unitIds.length) {
      const units = await client.query(
        `SELECT id FROM inventory_units
          WHERE id = ANY($1::uuid[]) AND variant_id = $2 AND branch_id = $3 AND status = 'in_stock'
          FOR UPDATE`,
        [unitIds, data.variant_id, data.from_branch_id]
      );
      if (units.rows.length !== unitIds.length) {
        throw ApiError.conflict('Some units are not in stock at the source branch for this variant');
      }
      await client.query('UPDATE inventory_units SET branch_id = $1 WHERE id = ANY($2::uuid[])', [data.to_branch_id, unitIds]);
    }

    const out = await client.query(
      'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2 RETURNING *', [data.quantity, src.id]
    );
    const into = await client.query(
      'UPDATE inventory SET quantity = quantity + $1 WHERE id = $2 RETURNING *', [data.quantity, dst.id]
    );

    const transferId = crypto.randomUUID();
    const common = {
      variantId: data.variant_id, qty: data.quantity, unitIds, refType: 'transfer', refId: transferId,
      userId: user.id, note: data.note ?? null,
    };
    await recordLineMovements(client, { ...common, branchId: data.from_branch_id, type: 'transfer_out', sign: -1 });
    await recordLineMovements(client, { ...common, branchId: data.to_branch_id, type: 'transfer_in', sign: 1 });

    await audit({
      actor: user, action: 'inventory.transfer', entity: 'inventory', entityId: src.id,
      data: {
        transfer_id: transferId, variant_id: data.variant_id, from_branch_id: data.from_branch_id,
        to_branch_id: data.to_branch_id, quantity: data.quantity, unit_ids: unitIds, note: data.note,
      },
      db: client,
    });

    const view = (r) => ({
      inventory_id: r.id, branch_id: r.branch_id, quantity: r.quantity, reserved: r.reserved,
      available: r.quantity - r.reserved,
    });
    return {
      transfer_id: transferId,
      variant_id: data.variant_id,
      quantity: data.quantity,
      unit_ids: unitIds,
      from: view(out.rows[0]),
      to: view(into.rows[0]),
    };
  });
};

/** Paginated stock ledger (newest first). */
const getMovements = async (q, user) => {
  const { page, limit, offset } = parsePagination(q);
  const where = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  const branchId = listBranchScope(user, q.branch_id);
  if (branchId) add('sm.branch_id = ?', branchId);
  if (q.variant_id) add('sm.variant_id = ?', q.variant_id);
  if (q.product_id) add('pv.product_id = ?', q.product_id);
  if (q.unit_id) add('sm.unit_id = ?', q.unit_id);
  if (q.movement_type) add('sm.movement_type = ?', q.movement_type);
  if (q.performed_by) add('sm.performed_by = ?', q.performed_by);
  if (q.performer) add('u.full_name ILIKE ?', `%${escapeLike(q.performer)}%`);
  addDateRange(where, params, 'sm.created_at', q);

  const from = `FROM stock_movements sm
    JOIN product_variants pv ON pv.id = sm.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN branches b ON b.id = sm.branch_id
    LEFT JOIN inventory_units iu ON iu.id = sm.unit_id
    LEFT JOIN users u ON u.id = sm.performed_by`;
  const whereSql = where.join(' AND ');
  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n ${from} WHERE ${whereSql}`, params),
    query(
      `SELECT sm.id, sm.created_at, sm.movement_type, sm.quantity_delta,
              sm.reference_type, sm.reference_id, sm.note,
              sm.variant_id, pv.sku, pv.variant_name, p.name AS product_name,
              sm.branch_id, b.name AS branch_name,
              sm.unit_id, iu.serial_number,
              sm.performed_by, u.full_name AS performed_by_name
         ${from} WHERE ${whereSql}
        ORDER BY sm.created_at DESC, sm.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/** Delete an empty stock row (super_admin). The ledger history stays. */
const remove = async (id, user) => {
  await withTransaction(async (client) => {
    const row = await lockRow(client, id, user);
    if (row.quantity !== 0 || row.reserved !== 0) {
      throw ApiError.conflict('Only an empty stock record (quantity 0, nothing reserved) can be deleted');
    }
    await client.query('DELETE FROM inventory WHERE id = $1', [id]);
    await audit({
      actor: user, action: 'inventory.delete', entity: 'inventory', entityId: id,
      data: { variant_id: row.variant_id, branch_id: row.branch_id }, db: client,
    });
  });
};

// ─── Serial registry ─────────────────────────────────────────
// inventory_units records the serial number and condition of individual
// (mostly used) laptops. It never decides availability — the fungible
// inventory row does. Registering a unit adds one to that row.

const UNIT_NOT_FOUND = 'Unit not found';

const UNIT_SELECT = `
  SELECT iu.id, iu.variant_id, pv.sku, pv.variant_name, pv.product_id, p.name AS product_name,
         iu.branch_id, b.name AS branch_name,
         iu.serial_number, iu.condition_grade, iu.battery_health, iu.cosmetic_notes,
         iu.cost_price, iu.listed_price, iu.notes, iu.status, iu.order_item_id,
         iu.received_at, iu.sold_at, iu.updated_at
    FROM inventory_units iu
    JOIN product_variants pv ON pv.id = iu.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN branches b ON b.id = iu.branch_id`;

const fetchUnit = async (db, id) => {
  const { rows } = await db.query(`${UNIT_SELECT} WHERE iu.id = $1`, [id]);
  return rows[0] || null;
};

const assertSerialFree = async (db, variantId, serialNumber, exceptId = null) => {
  const { rows } = await db.query(
    `SELECT 1 FROM inventory_units
      WHERE variant_id = $1 AND LOWER(serial_number) = LOWER($2) AND id IS DISTINCT FROM $3`,
    [variantId, serialNumber, exceptId]
  );
  if (rows.length) throw ApiError.conflict('This serial number is already registered for this variant');
};

/** Register a physical unit: +1 on the branch's stock, ledger 'received'. */
const createUnit = async (data, user) => {
  const branchId = writeBranchScope(user, data.branch_id);
  if (!branchId) throw ApiError.badRequest('branch_id is required');

  const id = await withTransaction(async (client) => {
    await assertActiveBranch(client, branchId);
    await assertVariant(client, data.variant_id);
    await assertSerialFree(client, data.variant_id, data.serial_number);

    await addStock(client, { variantId: data.variant_id, branchId, qty: 1 });
    const { rows } = await client.query(
      `INSERT INTO inventory_units
         (variant_id, branch_id, serial_number, condition_grade, battery_health,
          cosmetic_notes, cost_price, listed_price, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'in_stock', $10)
       RETURNING id`,
      [data.variant_id, branchId, data.serial_number, data.condition_grade ?? null,
       data.battery_health ?? null, data.cosmetic_notes ?? null, data.cost_price ?? null,
       data.listed_price ?? null, data.notes ?? null, user.id]
    );
    const unitId = rows[0].id;
    await recordMovement(client, {
      variantId: data.variant_id, branchId, unitId, type: 'received', delta: 1,
      refType: 'unit', refId: unitId, userId: user.id, note: `Serial ${data.serial_number}`,
    });
    await audit({
      actor: user, action: 'inventory.unit_create', entity: 'inventory_unit', entityId: unitId,
      data: { variant_id: data.variant_id, branch_id: branchId, serial_number: data.serial_number }, db: client,
    });
    return unitId;
  });
  return fetchUnit({ query }, id);
};

/** Paginated serial-registry list (branch scoped). */
const listUnits = async (q, user) => {
  const { page, limit, offset } = parsePagination(q);
  const where = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  const branchId = listBranchScope(user, q.branch_id);
  if (branchId) add('iu.branch_id = ?', branchId);
  if (q.variant_id) add('iu.variant_id = ?', q.variant_id);
  if (q.product_id) add('pv.product_id = ?', q.product_id);
  if (q.status) add('iu.status = ?', q.status);
  if (q.q) add('(iu.serial_number ILIKE ? OR p.name ILIKE ? OR pv.sku ILIKE ?)', `%${escapeLike(q.q)}%`);

  const whereSql = where.join(' AND ');
  const from = `FROM inventory_units iu
    JOIN product_variants pv ON pv.id = iu.variant_id
    JOIN products p ON p.id = pv.product_id`;
  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n ${from} WHERE ${whereSql}`, params),
    query(
      `${UNIT_SELECT} WHERE ${whereSql}
        ORDER BY iu.received_at DESC, iu.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/**
 * Allowed status changes. The fungible `inventory` row is the source of truth
 * for availability; serial units are a registry. So status changes are
 * bookkeeping, with one exception that can only LOWER stock:
 *   in_stock → written_off            quantity −1 (never below reserved)
 * Nothing here ever raises stock — otherwise cycling a unit
 * (in_stock → sold → returned → in_stock …) would mint phantom stock with no
 * sale behind it. Putting an item back on sale goes through
 * POST /inventory/:id/adjust (reason "returned"/"correction", audited), and a
 * POS void or order return restocks through its own flow.
 */
const UNIT_TRANSITIONS = {
  in_stock: ['sold', 'written_off'],
  sold: ['returned'],
  returned: ['in_stock', 'written_off'],
  written_off: ['in_stock'],
};

const UNIT_WRITABLE = [
  'serial_number', 'condition_grade', 'battery_health', 'cosmetic_notes', 'cost_price', 'listed_price', 'notes',
];

/** Update a unit's details and/or status (see UNIT_TRANSITIONS). */
const updateUnit = async (id, data, user) => {
  await withTransaction(async (client) => {
    // Read first, then lock inventory → unit (the global lock order).
    const peek = await client.query('SELECT variant_id, branch_id, status FROM inventory_units WHERE id = $1', [id]);
    if (!peek.rows.length) throw ApiError.notFound(UNIT_NOT_FOUND);
    assertBranchAccess(user, peek.rows[0].branch_id, UNIT_NOT_FOUND);

    const changingStatus = data.status !== undefined && data.status !== peek.rows[0].status;
    if (changingStatus) {
      await client.query(
        'SELECT id FROM inventory WHERE variant_id = $1 AND branch_id = $2 FOR UPDATE',
        [peek.rows[0].variant_id, peek.rows[0].branch_id]
      );
    }
    const { rows } = await client.query('SELECT * FROM inventory_units WHERE id = $1 FOR UPDATE', [id]);
    const unit = rows[0];
    if (unit.branch_id !== peek.rows[0].branch_id || unit.status !== peek.rows[0].status) {
      throw ApiError.conflict('The unit was changed by someone else — reload and try again');
    }

    if (data.serial_number && data.serial_number.toLowerCase() !== (unit.serial_number || '').toLowerCase()) {
      await assertSerialFree(client, unit.variant_id, data.serial_number, id);
    }

    const sets = [];
    const vals = [];
    for (const key of UNIT_WRITABLE) {
      if (data[key] !== undefined) {
        vals.push(data[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }

    if (changingStatus) {
      const from = unit.status;
      const to = data.status;
      if (!(UNIT_TRANSITIONS[from] || []).includes(to)) {
        throw ApiError.conflict(`A ${from.replace('_', ' ')} unit can't be marked ${to.replace('_', ' ')}`);
      }
      const ledger = {
        variantId: unit.variant_id, branchId: unit.branch_id, unitId: id, refType: 'unit', refId: id,
        userId: user.id, note: data.note ?? null,
      };
      if (to === 'written_off' && from === 'in_stock') {
        const dec = await client.query(
          `UPDATE inventory SET quantity = quantity - 1
            WHERE variant_id = $1 AND branch_id = $2 AND quantity - 1 >= reserved
            RETURNING id`,
          [unit.variant_id, unit.branch_id]
        );
        if (!dec.rows.length) {
          throw ApiError.conflict("Can't write off: the remaining stock is reserved for pending online orders");
        }
        await recordMovement(client, { ...ledger, type: 'written_off', delta: -1 });
      }

      vals.push(to);
      sets.push(`status = $${vals.length}`);
      if (to === 'sold') sets.push('sold_at = NOW()');
      if (to === 'in_stock') sets.push('sold_at = NULL', 'order_item_id = NULL');
    }

    if (sets.length) {
      vals.push(id);
      await client.query(`UPDATE inventory_units SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    }
    await audit({
      actor: user, action: 'inventory.unit_update', entity: 'inventory_unit', entityId: id,
      data: { ...data, ...(changingStatus && { status: { from: unit.status, to: data.status } }) },
      db: client,
    });
  });
  return fetchUnit({ query }, id);
};

// Writes that change stock refresh the storefront's stock-dependent pages.
module.exports = {
  getAll,
  getById,
  create: afterStockChange(create),
  update: afterStockChange(update),
  adjust: afterStockChange(adjust),
  transfer: afterStockChange(transfer),
  getMovements,
  remove: afterStockChange(remove),
  createUnit: afterStockChange(createUnit),
  listUnits,
  updateUnit: afterStockChange(updateUnit),
};
