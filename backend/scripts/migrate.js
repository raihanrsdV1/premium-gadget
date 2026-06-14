/**
 * Idempotent migration runner.
 *
 * Applies every *.sql file in src/db/migrations (sorted by filename) that
 * hasn't been applied yet, tracking applied files in a `schema_migrations`
 * table. Each migration runs inside its own transaction, so a failure rolls
 * back cleanly and isn't recorded.
 *
 * Convention: migration files contain plain SQL statements (NO BEGIN/COMMIT —
 * the runner owns the transaction) and should be additive/idempotent
 * (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc.).
 *
 * Base tables come from src/db/schema.sql (applied by Postgres on first init);
 * this runner only handles incremental migrations on top of that.
 *
 * Usage:  node scripts/migrate.js   (or `npm run migrate`)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✖ DATABASE_URL is not set');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`• skip   ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ apply  ${file}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✖ FAILED ${file}: ${err.message}`);
      await pool.end();
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`\nMigrations complete — applied ${count}, ${files.length} total.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
