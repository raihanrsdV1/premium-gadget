const { Client } = require('pg');
const { runMigrations } = require('../../scripts/migrate');

/**
 * Recreate the test database and apply every migration once per jest run.
 */
module.exports = async () => {
  const base = (process.env.TEST_PG_URL || 'postgres://postgres:test@127.0.0.1:55432').replace(/\/+$/, '');
  const dbName = process.env.TEST_DB_NAME || 'pg_test';
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe TEST_DB_NAME: ${dbName}`);

  const admin = new Client({ connectionString: `${base}/postgres` });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach test Postgres at ${base} (${err.message}).\n` +
        'Start it with: docker run -d --name pg_premium_gadget_test -e POSTGRES_PASSWORD=test ' +
        '-p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine'
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  await runMigrations({ connectionString: `${base}/${dbName}`, log: () => {} });
};
