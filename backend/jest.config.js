/**
 * Integration tests run against a real Postgres (see tests/README.md).
 * Each run recreates the database named by TEST_DB_NAME and applies every
 * migration, so tests always exercise the real schema.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.js'],
  testTimeout: 30000,
  // One shared database per run → files must not run concurrently.
  maxWorkers: 1,
};
