const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

/**
 * inventory service — business logic placeholder.
 * TODO: Implement full CRUD operations in Phase 3+.
 */

const getAll = async (queryParams) => {
  const { page, limit, offset } = parsePagination(queryParams);
  // TODO: Implement query
  return paginatedResponse([], 0, { page, limit });
};

const getById = async (id) => {
  // TODO: Implement query
  throw ApiError.notFound('Not implemented yet');
};

const create = async (data) => {
  // TODO: Implement insert
  throw ApiError.internal('Not implemented yet');
};

/**
 * Manual stock adjustment by an admin. Sets the new absolute quantity and
 * records the delta in the stock_movements ledger (with performed_by) inside
 * a single transaction.
 *
 * @param {string} id    - inventory row id
 * @param {{ quantity: number, low_stock_threshold?: number, note?: string }} data
 * @param {{ id: string }} user - authenticated admin
 */
const update = async (id, data, user) => {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM inventory WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = rows[0];
    if (!current) {
      throw ApiError.notFound('Inventory record not found');
    }

    const delta = data.quantity - current.quantity;

    const updated = await client.query(
      `UPDATE inventory
          SET quantity = $1,
              low_stock_threshold = COALESCE($2, low_stock_threshold)
        WHERE id = $3
        RETURNING *`,
      [data.quantity, data.low_stock_threshold ?? null, id]
    );

    if (delta !== 0) {
      await client.query(
        `INSERT INTO stock_movements
           (variant_id, branch_id, movement_type, quantity_delta,
            reference_type, performed_by, note)
         VALUES ($1, $2, 'adjustment', $3, 'manual', $4, $5)`,
        [current.variant_id, current.branch_id, delta, user.id, data.note ?? null]
      );
    }

    return updated.rows[0];
  });
};

const remove = async (id) => {
  // TODO: Implement delete
  throw ApiError.internal('Not implemented yet');
};

module.exports = { getAll, getById, create, update, remove };
