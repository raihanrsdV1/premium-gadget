const crypto = require('crypto');
const slugify = require('../../utils/slugify');
const ApiError = require('../../utils/ApiError');
const { escapeLike } = require('../../utils/validators');
const { MAX_HIGHLIGHTS } = require('../categories/spec-template');

/**
 * Helpers shared by the catalog modules (products, categories, brands).
 */

// Table names are interpolated into SQL, so only these are accepted. Each
// lists slugs that collide with static routes (/products/featured, …).
const SLUG_TABLES = {
  products: new Set(['admin', 'featured', 'search', 'sitemap', 'variants']),
  categories: new Set(['admin']),
  brands: new Set(['admin']),
  collections: new Set(['admin', 'home-order']),
};
// Leaves room for a "-NN" suffix inside the 140-char slug limit.
const MAX_BASE_LENGTH = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => UUID_RE.test(String(v));

const baseSlug = (name, fallback) => {
  const s = slugify(String(name || '')).slice(0, MAX_BASE_LENGTH).replace(/-+$/, '');
  // Names written only in Bangla (or symbols) slugify to nothing.
  return s || `${fallback}-${crypto.randomBytes(3).toString('hex')}`;
};

/**
 * Resolve a unique slug for a catalog row. Must run inside withTransaction:
 * an advisory lock on the slug family serialises concurrent writers, so two
 * products named "MacBook Air" created at once get "macbook-air" and
 * "macbook-air-2" instead of one of them failing.
 *
 *   - explicit `slug`: used as-is; 409 if another row already has it
 *   - otherwise: slugify(name), then "-2", "-3", … until free
 *
 * @param {{ query: Function }} db - transaction client
 * @param {'products'|'categories'|'brands'|'collections'} table
 * @param {{ name?: string, slug?: string, excludeId?: string, fallback?: string }} opts
 * @returns {Promise<string>}
 */
const resolveSlug = async (db, table, { name, slug, excludeId = null, fallback = 'item' }) => {
  const reserved = SLUG_TABLES[table];
  if (!reserved) throw new Error(`resolveSlug: unsupported table ${table}`);
  const base = slug || baseSlug(name, fallback);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`slug:${table}:${base}`]);

  if (slug) {
    if (reserved.has(slug)) throw ApiError.badRequest('This slug is reserved');
    const taken = await db.query(
      `SELECT 1 FROM ${table} WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      [slug, excludeId]
    );
    if (taken.rows.length) throw ApiError.conflict('Slug is already in use');
    return slug;
  }

  const { rows } = await db.query(
    `SELECT slug FROM ${table}
      WHERE (slug = $1 OR slug LIKE $2) AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [base, `${escapeLike(base)}-%`, excludeId]
  );
  const taken = new Set([...rows.map((r) => r.slug), ...reserved]);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/**
 * Build `col = $n` assignments for the columns present in `data`. Column
 * names come only from the caller's fixed allowlist.
 *
 * @param {object} data
 * @param {string[]} columns - allowlist
 * @param {any[]} [values]   - existing parameter array to append to
 * @returns {{ sets: string[], values: any[] }}
 */
const buildUpdate = (data, columns, values = []) => {
  const sets = [];
  for (const col of columns) {
    if (data[col] !== undefined) {
      values.push(data[col]);
      sets.push(`${col} = $${values.length}`);
    }
  }
  return { sets, values };
};

/** Keep audit payloads small: long text fields are summarised. */
const auditData = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (typeof v === 'string' && v.length > 200) out[k] = `[${v.length} chars]`;
    else if (Array.isArray(v)) out[k] = `[${v.length} items]`;
    else out[k] = v;
  }
  return out;
};

/**
 * Card highlights (key specs) for many products in ONE query: up to 4
 * highlighted spec rows per product, in spec order.
 *
 * @param {{ query: Function }} db
 * @param {string[]} productIds
 * @returns {Promise<Map<string, Array<{ label: string, value: string }>>>}
 */
const highlightsFor = async (db, productIds) => {
  const ids = [...new Set(productIds)];
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const { rows } = await db.query(
    `SELECT h.product_id,
            json_agg(json_build_object('label', h.spec_key, 'value', h.spec_value) ORDER BY h.n) AS highlights
       FROM (SELECT ps.product_id, ps.spec_key, ps.spec_value,
                    ROW_NUMBER() OVER (PARTITION BY ps.product_id ORDER BY ps.sort_order, ps.id) AS n
               FROM product_specifications ps
              WHERE ps.product_id = ANY($1::uuid[]) AND ps.is_highlight) h
      WHERE h.n <= $2
      GROUP BY h.product_id`,
    [ids, MAX_HIGHLIGHTS]
  );
  for (const r of rows) map.set(r.product_id, r.highlights);
  return map;
};

/** Attach `highlights` to product rows (by `id`) in place; returns the rows. */
const withHighlights = async (db, rows, idKey = 'id') => {
  const map = await highlightsFor(db, rows.map((r) => r[idKey]));
  rows.forEach((r) => {
    r.highlights = map.get(r[idKey]) || [];
  });
  return rows;
};

module.exports = { resolveSlug, buildUpdate, auditData, isUuid, highlightsFor, withHighlights };
