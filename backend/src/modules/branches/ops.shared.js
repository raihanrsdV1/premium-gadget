const ApiError = require('../../utils/ApiError');
const slugify = require('../../utils/slugify');
const { z, escapeLike } = require('../../utils/validators');

/**
 * Helpers shared by the operations modules (branches, inventory, POS,
 * repairs): staff branch scoping, date-range filters and unique slugs.
 *
 * Scoping rules: a super_admin works across all branches; a branch_admin is
 * pinned to req.user.branch_id. Records of another branch are reported as
 * "not found" (404) so their existence isn't revealed; an explicit request to
 * act on another branch is refused (403).
 */

const isSuperAdmin = (user) => user?.role === 'super_admin';

/** UUID equality regardless of letter case (input UUIDs may be upper-case). */
const sameId = (a, b) => Boolean(a && b) && String(a).toLowerCase() === String(b).toLowerCase();

const ownBranch = (user) => {
  if (!user.branch_id) throw ApiError.forbidden('Your account is not assigned to a branch');
  return user.branch_id;
};

/**
 * Branch filter for staff list endpoints. super_admin: the requested branch or
 * null (all branches). branch_admin: always their own branch.
 *
 * @param {object} user - req.user
 * @param {string} [requested] - branch_id from the query string
 * @returns {string|null}
 */
const listBranchScope = (user, requested) => {
  if (isSuperAdmin(user)) return requested || null;
  const own = ownBranch(user);
  if (requested && !sameId(requested, own)) throw ApiError.forbidden('You can only view your own branch');
  return own;
};

/**
 * Branch a staff write applies to. super_admin: the requested branch, falling
 * back to their own assignment. branch_admin: only their own branch.
 *
 * @returns {string|null} null when a super_admin gave none and has none
 */
const writeBranchScope = (user, requested) => {
  if (isSuperAdmin(user)) return requested || user.branch_id || null;
  const own = ownBranch(user);
  if (requested && !sameId(requested, own)) throw ApiError.forbidden('You can only manage your own branch');
  return own;
};

/** Throw 404 when a staff user may not see a record of `branchId`. */
const assertBranchAccess = (user, branchId, message = 'Not found') => {
  if (isSuperAdmin(user)) return;
  if (!sameId(user.branch_id, branchId)) throw ApiError.notFound(message);
};

// ─── Date ranges ─────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query-string date: YYYY-MM-DD (a whole Asia/Dhaka day) or an ISO datetime
 * with offset.
 */
const dateParam = z
  .string()
  .trim()
  .refine(
    (v) => (DATE_ONLY.test(v) || z.string().datetime({ offset: true }).safeParse(v).success) && !Number.isNaN(Date.parse(v)),
    'Use YYYY-MM-DD or an ISO 8601 datetime'
  );

/**
 * Append from/to conditions on `column` (a fixed, trusted SQL expression).
 * A date-only `to` is inclusive of that whole day in Asia/Dhaka.
 */
const addDateRange = (where, params, column, { from, to } = {}) => {
  if (from) {
    params.push(from);
    where.push(
      DATE_ONLY.test(from)
        ? `${column} >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Dhaka'`
        : `${column} >= $${params.length}::timestamptz`
    );
  }
  if (to) {
    params.push(to);
    where.push(
      DATE_ONLY.test(to)
        ? `${column} < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka')`
        : `${column} <= $${params.length}::timestamptz`
    );
  }
};

// ─── Slugs ───────────────────────────────────────────────────

// Tables whose slug column may be generated here (identifiers are never
// taken from input).
const SLUG_TABLES = new Set(['branches', 'repair_services']);

/**
 * First free slug for `text` in `table`: "name", then "name-2", "name-3"...
 * The UNIQUE constraint still guards against a concurrent insert (→ 409).
 *
 * @param {{ query: Function }} db
 * @param {'branches'|'repair_services'} table
 * @param {string} text - usually the record's name
 * @param {string} [fallback] - used when text has no slug-able characters
 */
const uniqueSlug = async (db, table, text, fallback = 'item') => {
  if (!SLUG_TABLES.has(table)) throw new Error(`uniqueSlug: unsupported table ${table}`);
  const base = (slugify(text) || fallback).slice(0, 120).replace(/-+$/, '') || fallback;
  const { rows } = await db.query(
    `SELECT slug FROM ${table} WHERE slug = $1 OR slug LIKE $2`,
    [base, `${escapeLike(base)}-%`]
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

module.exports = {
  uniqueSlug,
  isSuperAdmin,
  sameId,
  listBranchScope,
  writeBranchScope,
  assertBranchAccess,
  dateParam,
  addDateRange,
};
