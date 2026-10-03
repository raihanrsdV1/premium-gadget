/**
 * Adds the Phase 2 catalog data to an ALREADY-seeded database, without
 * wiping anything (a fresh database gets all of it from `npm run seed`):
 *
 *   - spec templates onto the existing categories, matched by slug. A
 *     category that already has a template keeps it (use --force to
 *     overwrite)
 *   - the demo products' spec rows, rebuilt as template fields / groups.
 *     Only products none of whose rows are linked to a template field yet
 *     are touched; their rows are REPLACED with the demo catalog's
 *   - the demo hero / promo banners, only if there are no banners at all
 *
 * Idempotent: a second run changes nothing.
 *
 *   node scripts/seed-phase2.js
 *   node scripts/seed-phase2.js --force          # also overwrite existing templates
 *   NODE_ENV=production node scripts/seed-phase2.js --allow-production
 *
 * Run migrations first (`npm run migrate`).
 */
require('dotenv').config();
const { Pool } = require('pg');
const slugify = require('../src/utils/slugify');
const { PRODUCTS } = require('../src/db/seed/catalog');
const { applyTemplate, resolveTemplate } = require('../src/modules/categories/spec-template');
const {
  parsedTemplates, catalogTemplateFor, specRowsFor, replaceProductSpecs, insertBanners,
} = require('../src/db/seed/specsAndBanners');

const isProd = (process.env.NODE_ENV || 'production') === 'production';
const args = new Set(process.argv.slice(2));

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');
  if (isProd && !args.has('--allow-production')) {
    fail('Refusing to seed demo data with NODE_ENV=production. Pass --allow-production to continue.');
  }
  const force = args.has('--force');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows: [schema] } = await client.query(
      `SELECT to_regclass('public.banners') IS NOT NULL AS ok`
    );
    if (!schema.ok) throw new Error('The banners table is missing. Run `npm run migrate` first.');

    await client.query('BEGIN');

    // 1. Spec templates.
    const templates = parsedTemplates();
    const tpl = { set: 0, kept: 0, missing: 0 };
    for (const [slug, template] of Object.entries(templates)) {
      const { rows } = await client.query('SELECT id, spec_template IS NOT NULL AS has FROM categories WHERE slug = $1', [slug]);
      if (!rows[0]) {
        tpl.missing += 1;
        continue;
      }
      if (rows[0].has && !force) {
        tpl.kept += 1;
        continue;
      }
      await client.query('UPDATE categories SET spec_template = $2 WHERE id = $1', [rows[0].id, template]);
      tpl.set += 1;
    }

    // 2. Demo products' specs → template fields. The category's template as
    //    stored (it may have been edited) decides groups and highlights.
    const specs = { mapped: 0, alreadyLinked: 0 };
    const productIdByName = {};
    for (const p of PRODUCTS) {
      const { rows } = await client.query(
        'SELECT id, category_id FROM products WHERE slug = $1 AND deleted_at IS NULL',
        [slugify(p.name)]
      );
      const product = rows[0];
      if (!product) continue;
      productIdByName[p.name] = product.id;

      const linked = await client.query(
        'SELECT 1 FROM product_specifications WHERE product_id = $1 AND field_key IS NOT NULL LIMIT 1',
        [product.id]
      );
      if (linked.rows.length) {
        specs.alreadyLinked += 1;
        continue;
      }
      const { template } = await resolveTemplate(client, product.category_id);
      const specRows = specRowsFor(p, catalogTemplateFor(p.category, templates));
      await replaceProductSpecs(client, product.id, applyTemplate(specRows, template));
      specs.mapped += 1;
    }

    // 3. Banners, only into an empty banners table.
    const { rows: [{ n: existingBanners }] } = await client.query('SELECT COUNT(*)::int AS n FROM banners');
    const banners = existingBanners ? 0 : await insertBanners(client, productIdByName);

    await client.query('COMMIT');

    console.log(
      `✓ spec templates: ${tpl.set} set, ${tpl.kept} kept (already had one${force ? '' : '; --force overwrites'}), ` +
        `${tpl.missing} category slug(s) not found`
    );
    console.log(`✓ product specs: ${specs.mapped} mapped to template fields, ${specs.alreadyLinked} already linked`);
    console.log(
      existingBanners
        ? `• banners: skipped (${existingBanners} already exist)`
        : `✓ banners: ${banners} inserted`
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => fail(err.message));
