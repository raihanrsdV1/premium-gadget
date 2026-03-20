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

module.exports = { pool, query };
