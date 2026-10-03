/**
 * Adds demo Phase 3 data to an ALREADY-seeded database, without wiping
 * anything: about 6 existing in-stock demo products each go into the manual
 * "Hot Sale" and "Trending" collections (created by migration 010).
 *
 * `npm run seed` truncates every table, default collections included, so
 * this script first re-applies migration 010 (idempotent) to restore them.
 *
 * Idempotent: a collection that already has products is left alone, so
 * running it twice (or after the owner curated the lists) changes nothing.
 *
 *   node scripts/seed-phase3.js
 *   NODE_ENV=production node scripts/seed-phase3.js --allow-production
 *
 * Run migrations first (`npm run migrate`).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const slugify = require('../src/utils/slugify');
const { PRODUCTS } = require('../src/db/seed/catalog');

const isProd = (process.env.NODE_ENV || 'production') === 'production';
const args = new Set(process.argv.slice(2));
const PER_COLLECTION = 6;
const TARGETS = ['hot-sale', 'trending'];

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');
  if (isProd && !args.has('--allow-production')) {
    fail('Refusing to seed demo data with NODE_ENV=production. Pass --allow-production to continue.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows: [schema] } = await client.query(`SELECT to_regclass('public.collections') IS NOT NULL AS ok`);
    if (!schema.ok) throw new Error('The collections table is missing. Run `npm run migrate` first.');

    await client.query('BEGIN');

    // Restores the default collections if a re-seed wiped them (no-op otherwise).
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'migrations', '010_collections.sql'), 'utf8'));

    // In-stock public products in a stable, well-mixed order.
    const { rows: pool_ } = await client.query(
      `SELECT p.id FROM products p
        WHERE p.is_active AND p.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                       WHERE v.product_id = p.id AND v.is_active AND i.quantity - i.reserved > 0)
        ORDER BY md5(p.id::text)`
    );
    const ids = pool_.map((r) => r.id);

    let added = 0;
    for (const [index, slug] of TARGETS.entries()) {
      const { rows: [col] } = await client.query(
        `SELECT c.id, c.source, (SELECT COUNT(*)::int FROM collection_products cp WHERE cp.collection_id = c.id) AS n
           FROM collections c WHERE c.slug = $1`,
        [slug]
      );
      if (!col) { console.log(`• ${slug}: collection not found, skipped`); continue; }
      if (col.source !== 'manual') { console.log(`• ${slug}: not a manual collection, skipped`); continue; }
      if (col.n > 0) { console.log(`• ${slug}: already has ${col.n} product(s), left alone`); continue; }

      // Each collection takes its own slice; with few products they overlap.
      const start = (index * PER_COLLECTION) % Math.max(ids.length, 1);
      const picked = Array.from({ length: Math.min(PER_COLLECTION, ids.length) }, (_, k) => ids[(start + k) % ids.length]);
      await client.query(
        `INSERT INTO collection_products (collection_id, product_id, sort_order)
         SELECT $1, t.pid, (t.ord - 1)::int FROM unnest($2::uuid[]) WITH ORDINALITY AS t(pid, ord)
         ON CONFLICT DO NOTHING`,
        [col.id, picked]
      );
      added += picked.length;
      console.log(`✓ ${slug}: ${picked.length} product(s) added`);
    }

    // "Gaming Laptops": a use-case theme, so a manual collection (not a category).
    await client.query(
      `INSERT INTO collections (name, slug, source, show_on_home, home_layout)
       VALUES ('Gaming Laptops', 'gaming-laptops', 'manual', FALSE, 'grid')
       ON CONFLICT (slug) DO NOTHING`
    );
    const gamingSlugs = PRODUCTS.filter((p) => p.collection === 'gaming-laptops').map((p) => slugify(p.name));
    const { rows: gaming } = await client.query(
      `SELECT c.id, c.source FROM collections c WHERE c.slug = 'gaming-laptops'`
    );
    if (gaming[0].source === 'manual' && gamingSlugs.length) {
      const res = await client.query(
        `INSERT INTO collection_products (collection_id, product_id, sort_order)
         SELECT $1, p.id, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM collection_products WHERE collection_id = $1)
                          + (ROW_NUMBER() OVER (ORDER BY p.name) - 1)
           FROM products p
          WHERE p.slug = ANY($2::text[]) AND p.deleted_at IS NULL
         ON CONFLICT DO NOTHING`,
        [gaming[0].id, gamingSlugs]
      );
      console.log(`✓ gaming-laptops: ${res.rowCount} product(s) added`);
    }

    await client.query('COMMIT');
    if (!added) console.log('Nothing to do.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => fail(err.message));
