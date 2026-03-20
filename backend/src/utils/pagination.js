/**
 * Parse pagination query parameters and return limit/offset.
 * @param {object} query - Express req.query
 * @param {number} defaultLimit
 * @returns {{ page: number, limit: number, offset: number }}
 */
const parsePagination = (query, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Build a paginated response envelope.
 * @param {Array} data
 * @param {number} total
 * @param {{ page: number, limit: number }} pagination
 * @returns {object}
 */
const paginatedResponse = (data, total, { page, limit }) => ({
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  },
});

module.exports = { parsePagination, paginatedResponse };
