/**
 * Idempotent migration runner — the ONLY way schema reaches a database.
 *
 * Applies every *.sql file in src/db/migrations (sorted by filename) that
 * hasn't been applied yet, tracking applied files in a `schema_migrations`
 * table. Each migration runs inside its own transaction, so a failure rolls
 * back cleanly and isn't recorded.
 *
 * 000_base_schema.sql holds the original base tables. Databases created the
 * old way (schema.sql via Postgres initdb) are detected and baselined: 000 is
 * marked as applied without being re-run.
 *
 * Convention: migration files contain plain SQL statements (NO BEGIN/COMMIT —
 * the runner owns the transaction) and should be additive/idempotent
 * (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc.).
 *
 * Usage:  node scripts/migrate.js   (or `npm run migrate`)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');
const BASE_MIGRATION = '000_base_schema.sql';

async function runMigrations({ connectionString, log = console.log } = {}) {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
    );

    // Baseline: base tables exist (legacy initdb) but 000 was never recorded.
    if (!applied.has(BASE_MIGRATION)) {
      const { rows } = await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS exists");
      if (rows[0].exists) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [BASE_MIGRATION]);
        applied.add(BASE_MIGRATION);
        log(`• baseline ${BASE_MIGRATION} (tables already present)`);
      }
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`✓ apply  ${file}`);
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        err.message = `Migration ${file} failed: ${err.message}`;
        throw err;
      } finally {
        client.release();
      }
    }

    log(`Migrations complete — applied ${count}, ${files.length} total.`);
    return count;
  } finally {
    await pool.end();
  }
}

module.exports = { runMigrations, MIGRATIONS_DIR };

if (require.main === module) {
  require('dotenv').config();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('✖ DATABASE_URL is not set');
    process.exit(1);
  }
  runMigrations({ connectionString }).catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  });
}
