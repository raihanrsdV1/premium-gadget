const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { resolveSlug, buildUpdate, auditData, isUuid } = require('../products/catalog.helpers');
const { revalidateAfter, TAGS } = require('../../lib/revalidate');
const { resolveTemplate, syncCategoryTree } = require('./spec-template');

const FIELDS = `c.id, c.name, c.slug, c.parent_id, c.icon_url, c.sort_order, c.is_active,
  c.description, c.meta_title, c.meta_description, c.banner_url, c.created_at, c.updated_at`;

const WRITABLE = [
  'name', 'parent_id', 'icon_url', 'sort_order', 'is_active',
  'description', 'meta_title', 'meta_description', 'banner_url',
];

// Products the storefront would list (matches GET /products): active, not
// deleted, with at least one active variant. A parent counts its direct
// children's products too, like the ?category= filter does.
const PRODUCT_COUNT = `(
  SELECT COUNT(*)::int FROM products p
   WHERE p.is_active AND p.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active)
     AND (p.category_id = c.id
          OR p.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id))
)`;

/** Nest a sorted flat list; children whose parent isn't in the list are dropped. */
const toTree = (rows) => {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (!node.parent_id) roots.push(node);
    else if (byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
  }
  return roots;
};

/**
 * Public category list: active only, sorted by sort_order then name.
 * @param {{ tree?: boolean }} opts
 */
const getAll = async ({ tree } = {}) => {
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count
       FROM categories c
      WHERE c.is_active
      ORDER BY c.sort_order, c.name`
  );
  return tree ? toTree(rows) : rows;
};

/**
 * Staff list: includes inactive categories, plus counts that matter when
 * deciding whether a category can be deleted, and each category's OWN spec
 * template (null when it inherits or has none).
 */
const getAdminList = async ({ tree } = {}) => {
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count, c.spec_template,
            (SELECT COUNT(*)::int FROM products p
              WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS total_product_count,
            (SELECT COUNT(*)::int FROM categories ch WHERE ch.parent_id = c.id) AS children_count
       FROM categories c
      ORDER BY c.sort_order, c.name`
  );
  return tree ? toTree(rows) : rows;
};

/**
 * Public single category by id or slug, with its parent and active children.
 * Inactive categories are 404.
 */
const getOne = async (idOrSlug) => {
  const where = isUuid(idOrSlug) ? 'c.id = $1' : 'c.slug = $1';
  const { rows } = await query(
    `SELECT ${FIELDS}, ${PRODUCT_COUNT} AS product_count
       FROM categories c WHERE ${where} AND c.is_active`,
    [idOrSlug]
  );
  const category = rows[0];
  if (!category) throw ApiError.notFound('Category not found');

  const [parent, children] = await Promise.all([
    category.parent_id
      ? query('SELECT id, name, slug FROM categories WHERE id = $1 AND is_active', [category.parent_id])
      : { rows: [] },
    query(
      `SELECT c.id, c.name, c.slug, c.icon_url, c.sort_order, ${PRODUCT_COUNT} AS product_count
         FROM categories c WHERE c.parent_id = $1 AND c.is_active
        ORDER BY c.sort_order, c.name`,
      [category.id]
    ),
  ]);
  return { ...category, parent: parent.rows[0] || null, children: children.rows };
};

const assertParent = async (db, parentId) => {
  const { rows } = await db.query('SELECT 1 FROM categories WHERE id = $1', [parentId]);
  if (!rows.length) throw ApiError.badRequest('Parent category does not exist');
};

/**
 * Create a category. The slug is derived from the name unless given.
 * @param {object} data  - validated createSchema
 * @param {object} actor - req.user
 */
const create = async (data, actor) =>
  withTransaction(async (client) => {
    if (data.parent_id) await assertParent(client, data.parent_id);
    const slug = await resolveSlug(client, 'categories', { name: data.name, slug: data.slug, fallback: 'category' });

    const cols = WRITABLE.filter((c) => data[c] !== undefined);
    const values = [slug, ...cols.map((c) => data[c])];
    const { rows } = await client.query(
      `INSERT INTO categories (slug${cols.map((c) => `, ${c}`).join('')})
       VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    const category = rows[0];
    await audit({ actor, action: 'category.create', entity: 'category', entityId: category.id, data: { name: category.name, slug }, db: client });
    return category;
  }).then(revalidateAfter([TAGS.categories]));

/**
 * Update a category. A new parent must exist and must not be the category
 * itself or one of its descendants (that would create a cycle).
 */
const update = async (id, data, actor) =>
  withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM categories WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Category not found');

    if (data.parent_id) {
      if (data.parent_id === id) throw ApiError.badRequest('A category cannot be its own parent');
      // Serialise re-parenting so two concurrent moves can't form a cycle
      // that neither check sees.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('categories:tree'))");
      await assertParent(client, data.parent_id);
      const cycle = await client.query(
        `WITH RECURSIVE sub AS (
           SELECT id FROM categories WHERE parent_id = $1
           UNION
           SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
         )
         SELECT 1 FROM sub WHERE id = $2`,
        [id, data.parent_id]
      );
      if (cycle.rows.length) throw ApiError.badRequest('A category cannot be moved under its own subcategory');
    }

    const values = [];
    const { sets } = buildUpdate(data, WRITABLE, values);
    if (data.slug !== undefined && data.slug !== current.slug) {
      values.push(await resolveSlug(client, 'categories', { slug: data.slug, excludeId: id }));
      sets.push(`slug = $${values.length}`);
    }
    if (!sets.length) return current;

    values.push(id);
    const { rows } = await client.query(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    // A new parent can change the template this subtree inherits.
    if (data.parent_id !== undefined && data.parent_id !== current.parent_id) await syncCategoryTree(client, id);
    await audit({ actor, action: 'category.update', entity: 'category', entityId: id, data: auditData(data), db: client });
    return rows[0];
  }).then(revalidateAfter([TAGS.categories, TAGS.products])); // product pages show the category

// ─── Spec templates ─────────────────────────────────────────────────────────

/**
 * Public: the spec template that applies to an active category (its own,
 * else the nearest ancestor's).
 * @returns {Promise<{ template: object|null, source_category_id: string|null }>}
 */
/**
 * @param {string} idOrSlug
 * @param {{ includeHidden?: boolean }} [opts] - staff can read a hidden category's template
 */
const getSpecTemplate = async (idOrSlug, { includeHidden = false } = {}) => {
  const where = isUuid(idOrSlug) ? 'id = $1' : 'slug = $1';
  const { rows } = await query(
    `SELECT id FROM categories WHERE ${where}${includeHidden ? '' : ' AND is_active'}`,
    [idOrSlug]
  );
  if (!rows[0]) throw ApiError.notFound('Category not found');
  return resolveTemplate({ query }, rows[0].id);
};

const templateSummary = (template) =>
  template
    ? { groups: template.groups.length, fields: template.groups.reduce((n, g) => n + g.fields.length, 0) }
    : { cleared: true };

/**
 * Set (or clear, with null) a category's own spec template, then re-sync
 * group / highlight of the spec rows of every product that inherits it.
 * @param {string} id
 * @param {object|null} template - validated templateSchema output
 * @returns {Promise<{ template: object|null, source_category_id: string|null }>} the resolved template
 */
const putSpecTemplate = async (id, template, actor) =>
  withTransaction(async (client) => {
    // Inheritance follows the tree: serialise with re-parenting.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('categories:tree'))");
    const { rowCount } = await client.query('UPDATE categories SET spec_template = $2 WHERE id = $1', [id, template]);
    if (!rowCount) throw ApiError.notFound('Category not found');
    await syncCategoryTree(client, id);
    await audit({
      actor,
      action: 'category.spec_template',
      entity: 'category',
      entityId: id,
      data: templateSummary(template),
      db: client,
    });
    return resolveTemplate(client, id);
  }).then(revalidateAfter([TAGS.categories, TAGS.products]));

/**
 * Hard-delete an unused category. Categories that still hold products (even
 * soft-deleted ones) or subcategories must be deactivated instead.
 */
const remove = async (id, actor) =>
  withTransaction(async (client) => {
    const current = (await client.query('SELECT id, name FROM categories WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!current) throw ApiError.notFound('Category not found');

    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*)::int FROM products   WHERE category_id = $1) AS products,
              (SELECT COUNT(*)::int FROM categories WHERE parent_id   = $1) AS children`,
      [id]
    );
    const { products, children } = rows[0];
    if (products || children) {
      throw ApiError.conflict(
        `Category is still used by ${products} product(s) and ${children} subcategory(ies). ` +
          'Deactivate it instead (is_active: false).'
      );
    }
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
    await audit({ actor, action: 'category.delete', entity: 'category', entityId: id, data: { name: current.name }, db: client });
  }).then(revalidateAfter([TAGS.categories]));

module.exports = { getAll, getAdminList, getOne, getSpecTemplate, create, update, putSpecTemplate, remove };
