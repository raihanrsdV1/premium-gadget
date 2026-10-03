const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { uniqueSlug } = require('./ops.shared');

// Fields safe for the public storefront (store locator, contact page).
const PUBLIC_FIELDS = `id, name, slug, address, phone, whatsapp, email, opening_hours, map_url,
  lat::float8 AS lat, lng::float8 AS lng`;
const ADMIN_FIELDS = `${PUBLIC_FIELDS}, is_active, sort_order, created_at, updated_at`;

// Columns a super_admin may set (fixed allowlist → safe to interpolate).
const WRITABLE = [
  'name', 'slug', 'address', 'phone', 'whatsapp', 'email', 'opening_hours',
  'map_url', 'lat', 'lng', 'sort_order', 'is_active',
];

const ORDER_BY = 'ORDER BY sort_order ASC, created_at ASC, name ASC';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Active branches for the storefront, in display order. */
const listPublic = async () => {
  const { rows } = await query(`SELECT ${PUBLIC_FIELDS} FROM branches WHERE is_active ${ORDER_BY}`);
  return rows;
};

/** One active branch by id or slug (404 when missing or inactive). */
const getPublic = async (idOrSlug) => {
  const column = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS} FROM branches WHERE ${column} = $1 AND is_active`,
    [idOrSlug]
  );
  if (!rows.length) throw ApiError.notFound('Branch not found');
  return rows[0];
};

/** Every branch (including inactive) with staff counts, for the admin app. */
const listAdmin = async () => {
  const { rows } = await query(
    `SELECT ${ADMIN_FIELDS},
            (SELECT COUNT(*)::int FROM users u
              WHERE u.branch_id = branches.id AND u.deleted_at IS NULL
                AND u.role IN ('branch_admin', 'super_admin')) AS staff_count
       FROM branches ${ORDER_BY}`
  );
  return rows;
};

const assertSlugFree = async (slug, exceptId = null) => {
  const { rows } = await query('SELECT id FROM branches WHERE slug = $1 AND id IS DISTINCT FROM $2', [slug, exceptId]);
  if (rows.length) throw ApiError.conflict('Another branch already uses this slug');
};

/** Create a branch (super_admin). The slug is generated from the name unless given. */
const create = async (data, actor) => {
  const values = { ...data };
  if (values.slug) await assertSlugFree(values.slug);
  else values.slug = await uniqueSlug({ query }, 'branches', values.name, 'branch');

  const cols = WRITABLE.filter((k) => values[k] !== undefined);
  const { rows } = await query(
    `INSERT INTO branches (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${ADMIN_FIELDS}`,
    cols.map((k) => values[k])
  );
  await audit({ actor, action: 'branch.create', entity: 'branch', entityId: rows[0].id, data: values });
  return rows[0];
};

/** Partial update (super_admin). Changing the name keeps the slug stable. */
const update = async (id, data, actor) => {
  if (data.slug) await assertSlugFree(data.slug, id);
  const cols = WRITABLE.filter((k) => data[k] !== undefined);
  const vals = cols.map((k) => data[k]);
  vals.push(id);
  const { rows } = await query(
    `UPDATE branches SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}
      WHERE id = $${vals.length}
      RETURNING ${ADMIN_FIELDS}`,
    vals
  );
  if (!rows.length) throw ApiError.notFound('Branch not found');
  await audit({ actor, action: 'branch.update', entity: 'branch', entityId: id, data });
  return rows[0];
};

/**
 * Delete an unused branch (super_admin). Stock, staff, orders and repair
 * tickets cascade or dangle from a branch, so a branch that has any of them
 * must be deactivated instead.
 */
const remove = async (id, actor) => {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM branches WHERE id = $1) AS found,
            EXISTS (SELECT 1 FROM inventory       WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM inventory_units WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM stock_movements WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM users           WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM orders          WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM order_items     WHERE branch_id = $1)
         OR EXISTS (SELECT 1 FROM repair_tickets  WHERE branch_id = $1) AS in_use`,
    [id]
  );
  if (!rows[0].found) throw ApiError.notFound('Branch not found');
  if (rows[0].in_use) {
    throw ApiError.conflict('This branch has stock, staff, orders or repair tickets — deactivate it instead');
  }
  await query('DELETE FROM branches WHERE id = $1', [id]);
  await audit({ actor, action: 'branch.delete', entity: 'branch', entityId: id });
};

module.exports = { listPublic, getPublic, listAdmin, create, update, remove };
