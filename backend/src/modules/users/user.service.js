const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { escapeLike } = require('../../utils/validators');
const { audit } = require('../../utils/audit');
const { hashPassword } = require('../../utils/password');
const { assertActiveBranch } = require('../inventory/inventory.stock');

const USER_FIELDS =
  'id, full_name, phone, email, role, avatar_url, is_active, phone_verified, branch_id, last_login_at, created_at';

const getAll = async (queryParams) => {
  const { page, limit, offset } = parsePagination(queryParams);
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (queryParams.role) {
    params.push(queryParams.role);
    where.push(`role = $${params.length}`);
  }
  if (queryParams.branch_id) {
    params.push(queryParams.branch_id);
    where.push(`branch_id = $${params.length}`);
  }
  if (queryParams.is_active !== undefined) {
    params.push(queryParams.is_active);
    where.push(`is_active = $${params.length}`);
  }
  if (queryParams.q) {
    params.push(`%${escapeLike(queryParams.q)}%`);
    const n = params.length;
    where.push(`(full_name ILIKE $${n} OR phone ILIKE $${n} OR email ILIKE $${n})`);
  }
  const whereSql = where.join(' AND ');
  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM users WHERE ${whereSql}`, params),
    query(
      `SELECT ${USER_FIELDS} FROM users WHERE ${whereSql}
        ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/** A user may read their own record; a super_admin may read anyone's. */
const getById = async (id, requester) => {
  if (requester.role !== 'super_admin' && requester.id !== id) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }
  const result = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
};

const update = async (id, data, actor) => {
  if (data.email) {
    const taken = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [data.email, id]);
    if (taken.rows.length) throw ApiError.conflict('Email already registered');
  }
  const sets = [];
  const vals = [];
  for (const key of ['full_name', 'email', 'avatar_url']) {
    if (data[key] !== undefined) {
      vals.push(data[key]);
      sets.push(`${key} = $${vals.length}`);
    }
  }
  vals.push(id);
  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} AND deleted_at IS NULL RETURNING ${USER_FIELDS}`,
    vals
  );
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  await audit({ actor, action: 'user.update', entity: 'user', entityId: id, data });
  return result.rows[0];
};

// ─── Super-admin safety ──────────────────────────────────────

/**
 * Lock every active super_admin row (in id order — always before the target
 * row, so concurrent admin changes can't deadlock) and check the actor is
 * still one of them. Two super_admins demoting each other at the same moment
 * serialize here; the second finds it is no longer a super_admin.
 *
 * @returns {Promise<string[]>} ids of the active super_admins
 */
const lockSuperAdmins = async (client, actor) => {
  const { rows } = await client.query(
    `SELECT id FROM users
      WHERE role = 'super_admin' AND is_active AND deleted_at IS NULL
      ORDER BY id FOR UPDATE`
  );
  const ids = rows.map((r) => r.id);
  if (!ids.includes(actor.id)) throw ApiError.forbidden('You are no longer an active super admin');
  return ids;
};

const assertNotLastSuperAdmin = (superAdminIds, targetId) => {
  if (superAdminIds.filter((id) => id !== targetId).length < 1) {
    throw ApiError.conflict('At least one active super admin must remain');
  }
};

const lockTarget = async (client, id) => {
  const { rows } = await client.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
  if (!rows.length) throw ApiError.notFound('User not found');
  return rows[0];
};

const isActiveSuperAdmin = (u) => u.role === 'super_admin' && u.is_active;

const remove = async (id, actor) => {
  if (actor.id === id) throw ApiError.badRequest('You cannot delete your own account');
  await withTransaction(async (client) => {
    const admins = await lockSuperAdmins(client, actor);
    const target = await lockTarget(client, id);
    if (isActiveSuperAdmin(target)) assertNotLastSuperAdmin(admins, id);
    await client.query(
      `UPDATE users SET deleted_at = NOW(), is_active = FALSE, token_version = token_version + 1
        WHERE id = $1`,
      [id]
    );
    await audit({ actor, action: 'user.delete', entity: 'user', entityId: id, db: client });
  });
};

// ─── Staff management (super_admin) ──────────────────────────

/** Create a staff account. Phone/email must be unused; branch_admin needs an active branch. */
const createStaff = async (data, actor) => {
  if (data.branch_id) await assertActiveBranch({ query }, data.branch_id);

  const phoneTaken = await query('SELECT 1 FROM users WHERE phone = $1', [data.phone]);
  if (phoneTaken.rows.length) {
    throw ApiError.conflict(
      'This phone number already has an account. Use "Change role" on that account instead — you will set a new password for it.'
    );
  }
  if (data.email) {
    const emailTaken = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [data.email]);
    if (emailTaken.rows.length) throw ApiError.conflict('Email already registered');
  }

  const hash = await hashPassword(data.password);
  // Staff are verified in person by the super_admin creating the account.
  const { rows } = await query(
    `INSERT INTO users (full_name, phone, email, password_hash, role, branch_id, phone_verified)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING ${USER_FIELDS}`,
    [data.full_name, data.phone, data.email || null, hash, data.role, data.branch_id || null]
  );
  await audit({
    actor, action: 'user.create_staff', entity: 'user', entityId: rows[0].id,
    data: { role: data.role, branch_id: data.branch_id || null, phone: data.phone },
  });
  return rows[0];
};

/**
 * Change a user's role / branch. Not your own; never removes the last active
 * super_admin. Revokes the user's sessions (token_version).
 *
 * Promoting an account whose phone was never verified requires setting a new
 * password (handed to the staff member in person). Otherwise someone who
 * registered a future employee's number in advance would keep their own
 * password and gain staff access when the admin promotes "that" account.
 */
const changeRole = async (id, data, actor) => {
  if (actor.id === id) throw ApiError.badRequest("You can't change your own role");
  const branchId = data.role === 'customer' ? null : data.branch_id || null;
  if (branchId) await assertActiveBranch({ query }, branchId);

  return withTransaction(async (client) => {
    const admins = await lockSuperAdmins(client, actor);
    const target = await lockTarget(client, id);
    if (isActiveSuperAdmin(target) && data.role !== 'super_admin') assertNotLastSuperAdmin(admins, id);

    const promoting = target.role === 'customer' && data.role !== 'customer';
    if (promoting && !target.phone_verified && !data.new_password) {
      throw ApiError.conflict(
        "This account's phone number isn't verified. Set a new password for it (give it to the staff member in person) to promote it."
      );
    }
    const newHash = promoting && data.new_password ? await hashPassword(data.new_password) : null;

    const { rows } = await client.query(
      `UPDATE users
          SET role = $1, branch_id = $2, token_version = token_version + 1,
              password_hash = COALESCE($4, password_hash),
              password_changed_at = CASE WHEN $4::text IS NULL THEN password_changed_at ELSE NOW() END,
              phone_verified = phone_verified OR $4::text IS NOT NULL
        WHERE id = $3 RETURNING ${USER_FIELDS}`,
      [data.role, branchId, id, newHash]
    );
    await audit({
      actor, action: 'user.role', entity: 'user', entityId: id, db: client,
      data: { from: { role: target.role, branch_id: target.branch_id }, to: { role: data.role, branch_id: branchId } },
    });
    return rows[0];
  });
};

/**
 * Activate / deactivate an account. Not yourself; never the last active
 * super_admin. Deactivating revokes sessions.
 */
const changeStatus = async (id, { is_active: isActive }, actor) => {
  if (actor.id === id && !isActive) throw ApiError.badRequest("You can't deactivate your own account");

  return withTransaction(async (client) => {
    const admins = await lockSuperAdmins(client, actor);
    const target = await lockTarget(client, id);
    if (!isActive && isActiveSuperAdmin(target)) assertNotLastSuperAdmin(admins, id);

    const { rows } = await client.query(
      `UPDATE users SET is_active = $1,
              token_version = token_version + CASE WHEN $1 THEN 0 ELSE 1 END
        WHERE id = $2 RETURNING ${USER_FIELDS}`,
      [isActive, id]
    );
    await audit({
      actor, action: 'user.status', entity: 'user', entityId: id, db: client,
      data: { from: target.is_active, to: isActive },
    });
    return rows[0];
  });
};

/**
 * Set a new password for another user (forgot-password at the counter).
 * Revokes their sessions. Your own password goes through /auth/password/change,
 * which requires the current one.
 */
const resetPassword = async (id, { new_password: newPassword }, actor) => {
  if (actor.id === id) throw ApiError.badRequest('Use /auth/password/change to change your own password');
  const hash = await hashPassword(newPassword);
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $1, password_changed_at = NOW(), token_version = token_version + 1
      WHERE id = $2 AND deleted_at IS NULL`,
    [hash, id]
  );
  if (!rowCount) throw ApiError.notFound('User not found');
  await audit({ actor, action: 'user.reset_password', entity: 'user', entityId: id });
};

module.exports = {
  getAll, getById, update, remove, createStaff, changeRole, changeStatus, resetPassword, USER_FIELDS,
};
