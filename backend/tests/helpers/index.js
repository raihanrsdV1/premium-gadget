/**
 * Shared integration-test helpers.
 *
 *   const { api, resetDb, factories: f } = require('./helpers');
 *   beforeEach(resetDb);
 *   const { token } = await f.user({ role: 'super_admin' });
 *   await api.get('/api/v1/users').set(f.auth(token)).expect(200);
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { query } = require('../../src/config/database');
const { generateToken } = require('../../src/modules/auth/auth.service');

const api = request(app);

/** Empty every table (keeps schema_migrations and sequences). */
const resetDb = async () => {
  const { rows } = await query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    await query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
};

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

// Cheap hash for test users (cost 4) — production uses 12.
const PASSWORD = 'Passw0rd!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

/** Unique valid BD phone number. */
const phone = () => `017${String(10000000 + ((Date.now() + seq++) % 89999999)).slice(0, 8)}`;

const factories = {
  PASSWORD,
  auth: (token) => ({ Authorization: `Bearer ${token}` }),

  async branch(overrides = {}) {
    const s = uniq();
    const { rows } = await query(
      `INSERT INTO branches (name, slug, address, phone, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        overrides.name || `Branch ${s}`,
        overrides.slug || `branch-${s}`,
        overrides.address || 'Shop 451, Level 4, Sanmar Ocean City, Chattogram',
        overrides.phone || '01886670543',
        overrides.is_active ?? true,
      ]
    );
    return rows[0];
  },

  /** Create a user and return { user, token }. */
  async user({ role = 'customer', branch_id = null, phone_verified = true, is_active = true, ...rest } = {}) {
    const { rows } = await query(
      `INSERT INTO users (full_name, phone, email, password_hash, role, branch_id, phone_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, phone, email, role, branch_id, phone_verified, token_version`,
      [
        rest.full_name || `Test ${role}`,
        rest.phone || phone(),
        rest.email || null,
        PASSWORD_HASH,
        role,
        branch_id,
        phone_verified,
        is_active,
      ]
    );
    const user = rows[0];
    return { user, token: generateToken(user) };
  },

  async category(overrides = {}) {
    const s = uniq();
    const { rows } = await query(
      `INSERT INTO categories (name, slug, parent_id, is_active) VALUES ($1, $2, $3, $4) RETURNING *`,
      [overrides.name || `Category ${s}`, overrides.slug || `category-${s}`, overrides.parent_id || null, overrides.is_active ?? true]
    );
    return rows[0];
  },

  async brand(overrides = {}) {
    const s = uniq();
    const { rows } = await query(
      `INSERT INTO brands (name, slug, is_active) VALUES ($1, $2, $3) RETURNING *`,
      [overrides.name || `Brand ${s}`, overrides.slug || `brand-${s}`, overrides.is_active ?? true]
    );
    return rows[0];
  },

  /**
   * Product with one or more variants and per-branch stock.
   *   await f.product({ variants: [{ price: 50000, stock: [{ branch_id, quantity: 3 }] }] })
   * Returns { product, variants: [variantRow...] }.
   */
  async product({ category_id, brand_id, name, condition = 'new', is_active = true, is_featured = false, variants } = {}) {
    const s = uniq();
    const cat = category_id || (await factories.category()).id;
    const { rows } = await query(
      `INSERT INTO products (name, slug, category_id, brand_id, condition, is_active, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name || `Laptop ${s}`, `laptop-${s}`, cat, brand_id || null, condition, is_active, is_featured]
    );
    const product = rows[0];
    const created = [];
    for (const v of variants || [{ price: 50000 }]) {
      const vr = await query(
        `INSERT INTO product_variants (product_id, sku, variant_name, price, compare_at_price, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [product.id, v.sku || `SKU-${uniq()}`, v.variant_name || 'Default', v.price ?? 50000, v.compare_at_price ?? null, v.is_active ?? true]
      );
      const variant = vr.rows[0];
      for (const st of v.stock || []) {
        await query(
          `INSERT INTO inventory (variant_id, branch_id, quantity, reserved) VALUES ($1, $2, $3, $4)`,
          [variant.id, st.branch_id, st.quantity, st.reserved || 0]
        );
      }
      created.push(variant);
    }
    return { product, variants: created };
  },

  async stock(variantId, branchId) {
    const { rows } = await query('SELECT * FROM inventory WHERE variant_id = $1 AND branch_id = $2', [variantId, branchId]);
    return rows[0];
  },
};

module.exports = { api, app, query, resetDb, factories, uniq, phone };
