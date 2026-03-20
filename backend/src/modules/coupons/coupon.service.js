const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

/**
 * coupons service — business logic placeholder.
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

const update = async (id, data) => {
  // TODO: Implement update
  throw ApiError.internal('Not implemented yet');
};

const remove = async (id) => {
  // TODO: Implement delete
  throw ApiError.internal('Not implemented yet');
};

module.exports = { getAll, getById, create, update, remove };
