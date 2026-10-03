/**
 * Demo data seeder — realistic catalog for previewing the storefront.
 *
 *   npm run seed                 # dev: seed if the DB has no products yet
 *   npm run seed -- --reset      # dev only: wipe ALL data, then seed
 *   NODE_ENV=production npm run seed -- --allow-production
 *                                # staging/prod preview: catalog (with spec
 *                                # templates and homepage banners) + branch +
 *                                # repair price list only (no users, no coupons)
 *
 * Development additionally gets demo accounts (printed below) with known
 * passwords, a demo coupon and a few reviews. Those are NEVER created when
 * NODE_ENV=production. Create real admins with `npm run create-admin`.
 *
 * Run migrations first (`npm run migrate`).
 */
require('dotenv').config();
const { Pool } = require('pg');
const slugify = require('../src/utils/slugify');
const { hashPassword } = require('../src/utils/password');
const { IMAGES, BRANCHES, CATEGORIES, BRANDS, PRODUCTS, REPAIR_SERVICES, BANNERS } = require('../src/db/seed/catalog');
const {
  parsedTemplates, catalogTemplateFor, specRowsFor, replaceProductSpecs, insertBanners,
} = require('../src/db/seed/specsAndBanners');

const isProd = (process.env.NODE_ENV || 'production') === 'production';
const args = new Set(process.argv.slice(2));

const DEV_USERS = [
  { full_name: 'Dev Super Admin', phone: '01700000001', password: 'DevAdmin#2026', role: 'super_admin' },
  { full_name: 'Dev Shop Staff', phone: '01700000002', password: 'DevStaff#2026', role: 'branch_admin' },
  { full_name: 'Rahim Uddin', phone: '01700000003', password: 'DevCustomer#2026', role: 'customer' },
  { full_name: 'Nusrat Jahan', phone: '01700000004', password: 'DevCustomer#2026', role: 'customer' },
];

const DEV_REVIEWS = [
  ['Lenovo ThinkPad T480 (Used)', 0, 5, 'Exactly as described', 'Battery health was even better than listed. Keyboard is amazing.'],
  ['Lenovo ThinkPad T480 (Used)', 1, 4, 'Good value', 'Minor scratch on the lid as mentioned. Works perfectly for office work.'],
  ['Apple MacBook Air M1 13" (Used)', 0, 5, 'Like new', 'Very clean unit, cycle count matched the listing. Fast delivery in Chattogram.'],
  ['Logitech MX Master 3S Wireless Mouse', 1, 5, 'Best mouse I have used', 'Genuine product with warranty card.'],
];

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');
  if (isProd && !args.has('--allow-production')) {
    fail('Refusing to seed demo data with NODE_ENV=production. Pass --allow-production to seed the catalog only.');
  }
  if (isProd && args.has('--reset')) fail('--reset is not allowed in production');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    if (args.has('--reset')) {
      const { rows } = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
      );
      await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
      console.log('• wiped all data');
    } else {
      const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM products');
      if (rows[0].n > 0) {
        console.log(`• skip seed: database already has ${rows[0].n} products (use --reset in dev to re-seed)`);
        return;
      }
    }

    await client.query('BEGIN');

    // Branches (the shop's real GEC and WASA branches).
    const branchIds = [];
    for (const b of BRANCHES) {
      const { rows } = await client.query(
        `INSERT INTO branches (name, slug, address, phone, whatsapp, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [b.name, b.slug, b.address, b.phone, b.whatsapp, b.sort]
      );
      branchIds.push(rows[0].id);
    }
    const branch = { id: branchIds[0] };
    let unitCounter = 0;

    // Categories (parents first), with their spec templates (subcategories inherit).
    const templates = parsedTemplates();
    const categoryIds = {};
    for (const c of [...CATEGORIES].sort((a, b) => Boolean(a.parent) - Boolean(b.parent))) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, slug, parent_id, sort_order, is_active, description, spec_template)
         VALUES ($1, $2, $3, $4, TRUE, $5, $6) RETURNING id`,
        [c.name, c.slug, c.parent ? categoryIds[c.parent] : null, c.sort || 0, c.description || null, templates[c.slug] || null]
      );
      categoryIds[c.slug] = rows[0].id;
    }

    const brandIds = {};
    for (const [i, [name, slug]] of BRANDS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO brands (name, slug, is_active, sort_order) VALUES ($1, $2, TRUE, $3) RETURNING id`,
        [name, slug, i]
      );
      brandIds[slug] = rows[0].id;
    }

    const now = Date.now();
    const productIds = {};
    for (const p of PRODUCTS) {
      const { rows } = await client.query(
        `INSERT INTO products
           (name, slug, short_description, description_md, category_id, brand_id, condition, condition_notes,
            is_featured, is_active, meta_title, meta_description,
            warranty_months, warranty_type, warranty_notes,
            condition_grade, battery_health, battery_cycles, accessories, badge, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          p.name, slugify(p.name), p.short, p.description, categoryIds[p.category], brandIds[p.brand],
          p.condition, p.conditionNotes || null, Boolean(p.featured),
          `${p.name} Price in Bangladesh`,
          `${p.short} Buy at Premium Gadget, Chattogram. ${p.condition === 'used' ? 'Tested, graded used item with shop warranty.' : 'Official warranty.'} Cash on delivery available.`,
          p.warranty?.months ?? null, p.warranty?.type ?? null, p.warranty?.notes ?? null,
          p.grade || null, p.battery ?? null, p.cycles ?? null, p.accessories || null, p.badge || null, p.sort || 0,
        ]
      );
      const productId = rows[0].id;
      productIds[p.name] = productId;

      // Grouped spec table from the category template (highlights = card key specs).
      await replaceProductSpecs(client, productId, specRowsFor(p, catalogTemplateFor(p.category, templates)));
      for (const [i, f] of p.features.entries()) {
        await client.query(
          'INSERT INTO product_key_features (product_id, feature, sort_order) VALUES ($1, $2, $3)',
          [productId, f, i]
        );
      }
      for (const [i, key] of p.images.entries()) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
           VALUES ($1, $2, $3, $4, $5)`,
          [productId, IMAGES[key], `${p.name}${i ? ` — photo ${i + 1}` : ''}`, i, i === 0]
        );
      }
      for (const v of p.variants) {
        const sale = v.sale
          ? [v.sale.price, new Date(now - 86400000), new Date(now + v.sale.days * 86400000)]
          : [null, null, null];
        const vr = await client.query(
          `INSERT INTO product_variants
             (product_id, sku, variant_name, color, price, compare_at_price, cost_price,
              sale_price, sale_starts_at, sale_ends_at, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) RETURNING id`,
          [productId, v.sku, v.name, v.color || null, v.price, v.compare || null, Math.round(v.price * 0.82), ...sale]
        );
        const variantId = vr.rows[0].id;
        for (const [i, [k, val]] of Object.entries(v.attrs || {}).entries()) {
          await client.query(
            'INSERT INTO variant_attributes (variant_id, attribute_key, attribute_value, sort_order) VALUES ($1, $2, $3, $4)',
            [variantId, k, val, i]
          );
        }
        // Spread demo stock across both branches (single units alternate).
        const split = v.stock > 1
          ? [Math.ceil(v.stock / 2), Math.floor(v.stock / 2)]
          : (unitCounter++ % 2 === 0 ? [v.stock, 0] : [0, v.stock]);
        for (const [bi, qty] of split.entries()) {
          if (!qty) continue;
          await client.query(
            `INSERT INTO inventory (variant_id, branch_id, quantity, low_stock_threshold) VALUES ($1, $2, $3, 1)`,
            [variantId, branchIds[bi], qty]
          );
          await client.query(
            `INSERT INTO stock_movements (variant_id, branch_id, movement_type, quantity_delta, reference_type, note)
             VALUES ($1, $2, 'initial', $3, 'seed', 'Demo seed stock')`,
            [variantId, branchIds[bi], qty]
          );
        }
      }
    }

    // Homepage hero slides and promo banners.
    await insertBanners(client, productIds);

    for (const [name, description, price] of REPAIR_SERVICES) {
      await client.query(
        `INSERT INTO repair_services (name, slug, description, base_price, is_active) VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (slug) DO NOTHING`,
        [name, slugify(name), description, price]
      );
    }

    if (!isProd) {
      const userIds = [];
      for (const u of DEV_USERS) {
        const { rows } = await client.query(
          `INSERT INTO users (full_name, phone, password_hash, role, phone_verified, is_active, branch_id)
           VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)
           ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING id`,
          [u.full_name, u.phone, await hashPassword(u.password), u.role, u.role === 'customer' ? null : branch.id]
        );
        userIds.push(rows[0].id);
      }
      const customers = userIds.slice(2);
      for (const [productName, who, rating, title, body] of DEV_REVIEWS) {
        await client.query(
          `INSERT INTO reviews (product_id, user_id, rating, title, body, is_approved, verified_purchase)
           VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)`,
          [productIds[productName], customers[who], rating, title, body]
        );
      }
      await client.query(
        `INSERT INTO coupons (code, description, discount_type, discount_value, min_order_value, per_user_limit,
                              valid_from, valid_until, is_active)
         VALUES ('WELCOME500', '৳500 off your first order above ৳30,000', 'fixed', 500, 30000, 1,
                 NOW() - INTERVAL '1 day', NOW() + INTERVAL '90 days', TRUE)
         ON CONFLICT DO NOTHING`
      );
    }

    await client.query('COMMIT');

    console.log(
      `✓ seeded ${BRANCHES.length} branches, ${PRODUCTS.length} products, ${CATEGORIES.length} categories ` +
        `(${Object.keys(templates).length} spec templates), ${BRANDS.length} brands, ${BANNERS.length} banners, ` +
        `${REPAIR_SERVICES.length} repair services`
    );
    if (!isProd) {
      console.log('\nDev accounts (local development only):');
      for (const u of DEV_USERS) console.log(`  ${u.role.padEnd(12)} ${u.phone}  ${u.password}`);
      console.log('  Demo coupon: WELCOME500');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => fail(err.message));
