const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({
  connectionString: config.db.url,
});

// Log connection status on first connect
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
  process.exit(1);
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
 * client is always released back to the pool.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 *
 * @example
 *   await withTransaction(async (client) => {
 *     await client.query('UPDATE ...', [..]);
 *     return client.query('INSERT ...', [..]);
 *   });
 */
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
