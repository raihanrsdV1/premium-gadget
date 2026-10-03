/**
 * Runs before each test file (before the app is required).
 *
 *   TEST_PG_URL   server URL without database (default: the docker test
 *                 container on 127.0.0.1:55432)
 *   TEST_DB_NAME  database to (re)create for this run (default pg_test) —
 *                 use distinct names to run several suites in parallel
 */
const base = (process.env.TEST_PG_URL || 'postgres://postgres:test@127.0.0.1:55432').replace(/\/+$/, '');
const dbName = process.env.TEST_DB_NAME || 'pg_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `${base}/${dbName}`;
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars';
process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:5173';
process.env.STOREFRONT_URL = 'http://localhost:3000';
process.env.SERVER_PUBLIC_URL = 'http://localhost:5001/api/v1';
process.env.SSLCOMMERZ_STORE_ID = 'teststore';
process.env.SSLCOMMERZ_STORE_PASSWORD = 'teststorepass';
process.env.SSLCOMMERZ_IS_SANDBOX = 'true';
process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
process.env.INTERNAL_API_KEY = 'test-internal-key';
