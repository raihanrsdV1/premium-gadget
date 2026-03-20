const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

const getAll = async (queryParams) => {
  const { page, limit, offset } = parsePagination(queryParams);
  const countResult = await query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
  const total = parseInt(countResult.rows[0].count, 10);
  const result = await query(
    'SELECT id, full_name, phone, email, role, is_active, phone_verified, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return paginatedResponse(result.rows, total, { page, limit });
};

const getById = async (id) => {
  const result = await query(
    'SELECT id, full_name, phone, email, role, avatar_url, phone_verified, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
};

const update = async (id, data) => {
  const { full_name, email, avatar_url } = data;
  const result = await query(
    'UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE id = $4 AND deleted_at IS NULL RETURNING id, full_name, phone, email, avatar_url',
    [full_name, email, avatar_url, id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
};

const remove = async (id) => {
  const result = await query('UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (result.rowCount === 0) throw ApiError.notFound('User not found');
};

module.exports = { getAll, getById, update, remove };
