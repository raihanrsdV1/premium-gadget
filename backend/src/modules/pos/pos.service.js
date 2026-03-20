const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { generateOrderNumber } = require('../../utils/generateOrderNumber');

/**
 * POS service — walk-in sales.
 * Creates an order with channel='pos' and payment_method='cash'.
 * TODO: Implement full POS logic in Phase 3+.
 */

const createSale = async (data, operator) => {
  // TODO: 1. Create order with channel='pos', pos_operator_id, branch_id from operator
  // TODO: 2. Create order_items and decrement inventory
  // TODO: 3. Create transaction with payment_method='cash' and status='completed'
  throw ApiError.internal('POS sale not implemented yet');
};

const getSales = async (queryParams, user) => {
  const { page, limit, offset } = parsePagination(queryParams);
  // TODO: Fetch POS orders, filter by branch for branch_admin
  return paginatedResponse([], 0, { page, limit });
};

const getSaleById = async (id) => {
  throw ApiError.notFound('Not implemented yet');
};

module.exports = { createSale, getSales, getSaleById };
