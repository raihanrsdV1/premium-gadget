const { query } = require('../../config/database');
const { paginatedResponse } = require('../../utils/pagination');
const { escapeLike } = require('../../utils/validators');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Activity log page (newest first) with filters. `action` is a prefix match
 * ("variant." matches variant.update); a date-only `to` includes that day.
 * @param {object} qp - validated listQuery
 */
const list = async (qp) => {
  const page = qp.page || 1;
  const limit = qp.limit || 50;
  const params = [];
  const where = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (qp.actor_id) where.push(`a.actor_id = ${add(qp.actor_id)}`);
  if (qp.action) where.push(`a.action LIKE ${add(`${escapeLike(qp.action)}%`)}`);
  if (qp.entity) where.push(`a.entity = ${add(qp.entity)}`);
  if (qp.entity_id) where.push(`a.entity_id = ${add(qp.entity_id)}`);
  if (qp.from) where.push(`a.created_at >= ${add(qp.from)}::timestamptz`);
  if (qp.to) {
    const n = add(qp.to);
    where.push(DATE_ONLY.test(qp.to) ? `a.created_at < (${n}::date + 1)::timestamptz` : `a.created_at <= ${n}::timestamptz`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [data, count] = await Promise.all([
    query(
      `SELECT a.id, a.created_at AS at, a.actor_id, u.full_name, u.role,
              a.action, a.entity, a.entity_id, a.data, a.ip
         FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_id
         ${whereSql}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    ),
    query(`SELECT COUNT(*)::int AS n FROM admin_audit_log a ${whereSql}`, params),
  ]);
  const rows = data.rows.map(({ actor_id, full_name, role, ...r }) => ({
    ...r,
    actor: actor_id ? { id: actor_id, full_name, role } : null,
  }));
  return paginatedResponse(rows, count.rows[0].n, { page, limit });
};

/** Distinct action names, for a filter dropdown. */
const actions = async () => {
  const { rows } = await query('SELECT DISTINCT action FROM admin_audit_log ORDER BY action');
  return rows.map((r) => r.action);
};

module.exports = { list, actions };
