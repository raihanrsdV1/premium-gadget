// Close this test file's pool so jest can exit cleanly.
afterAll(async () => {
  const { pool } = require('../../src/config/database');
  await pool.end().catch(() => {});
});
