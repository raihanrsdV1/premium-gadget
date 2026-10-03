const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.poolMax,
  // Fail fast instead of hanging requests when the DB is unreachable.
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  // Kill runaway queries rather than tying up a pooled connection.
  statement_timeout: 15000,
});

// An idle client erroring (e.g. DB restart) is recoverable — the pool drops
// that client and creates a new one on demand. Log it; don't crash.
pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text  - SQL query string
 * @param {Array}  params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Run a callback inside a single database transaction.
 * Acquires a dedicated client, issues BEGIN, runs the callback with that
 * client, then COMMITs on success or ROLLBACKs on any thrown error. The
 * client is always released back to the pool (destroyed if ROLLBACK itself
 * failed, so a broken connection is never reused).
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
const withTransaction = async (callback) => {
  const client = await pool.connect();
  let releaseErr;
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      releaseErr = rollbackErr;
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
};

module.exports = { pool, query, withTransaction };
