const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

// Default to production so a missing NODE_ENV never enables dev-only behaviour
// (stack traces in responses, ephemeral secrets).
const env = process.env.NODE_ENV || 'production';
const isProd = env === 'production';
const isTest = env === 'test';

// Secrets that have ever appeared in this (public) repository, plus anything
// that looks like an unedited placeholder. Refused in production even if
// someone copies them into .env.
const KNOWN_WEAK_SECRETS = new Set([
  'fallback_secret_change_me',
  'super_secret_jwt_key_change_in_production_2024',
  'change_me_jwt_secret_key',
]);
const PLACEHOLDER = /change[_-]?me|your[_-]|placeholder|example|secret_here/i;

/** True if a secret is missing, short, or obviously a placeholder. */
const isWeakSecret = (value, minLength = 32) =>
  !value || value.length < minLength || KNOWN_WEAK_SECRETS.has(value) || PLACEHOLDER.test(value);

const resolveJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!isWeakSecret(secret)) return secret;
  if (isProd) {
    throw new Error(
      'JWT_SECRET is missing or weak. Set a random value of at least 32 characters (openssl rand -hex 32).'
    );
  }
  // Dev/test: an ephemeral secret keeps things working; tokens die on restart.
  if (!isTest) console.warn('⚠️  JWT_SECRET missing/weak — using an ephemeral dev secret.');
  return crypto.randomBytes(32).toString('hex');
};

/**
 * The storefront→API key exempts SSR from the global per-IP limit, so a weak
 * one is as bad as no limit. In production a weak key is a startup error;
 * leaving it unset simply disables the exemption.
 */
const resolveInternalKey = () => {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return null;
  if (!isWeakSecret(key)) return key;
  if (isProd) throw new Error('INTERNAL_API_KEY is weak or a placeholder. Use at least 32 random characters, or leave it unset.');
  return key;
};

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Strict boolean env parsing: typos like "False " or "no" must not silently flip a setting. */
const bool = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`${name} must be "true" or "false" (got "${raw}")`);
};

/**
 * SSLCommerz sandbox mode. In production it must be set explicitly, and
 * sandbox needs a second explicit opt-in: sandbox test cards "pay" for real
 * orders, so a forgotten flag must fail closed, not open.
 */
const resolveSandbox = () => {
  if (!isProd) return bool('SSLCOMMERZ_IS_SANDBOX', true);
  const sandbox = bool('SSLCOMMERZ_IS_SANDBOX', undefined);
  if (sandbox === undefined) throw new Error('SSLCOMMERZ_IS_SANDBOX must be set to "true" or "false" in production');
  if (sandbox && !bool('ALLOW_SANDBOX_IN_PRODUCTION', false)) {
    throw new Error(
      'SSLCOMMERZ_IS_SANDBOX=true in production. Payments would be fake. Set ALLOW_SANDBOX_IN_PRODUCTION=true only for pre-launch testing.'
    );
  }
  return sandbox;
};

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Storefront on-demand revalidation target. The storefront's /api/revalidate
 * rejects secrets shorter than 16 characters, so a short or placeholder
 * secret would fail every call: production refuses to start; elsewhere
 * revalidation is disabled with a warning. Read from the environment on each
 * access so tests can toggle it.
 */
const MIN_REVALIDATE_SECRET = 16;
const resolveRevalidate = ({ quiet = false } = {}) => {
  const url = process.env.STOREFRONT_REVALIDATE_URL || null;
  const secret = process.env.REVALIDATE_SECRET || null;
  if (!url) return { url: null, secret: null };
  if (isWeakSecret(secret, MIN_REVALIDATE_SECRET)) {
    const msg = `REVALIDATE_SECRET must be at least ${MIN_REVALIDATE_SECRET} random characters when STOREFRONT_REVALIDATE_URL is set.`;
    if (isProd) throw new Error(msg);
    if (!quiet && !isTest) console.warn(`⚠️  ${msg} Storefront revalidation is disabled.`);
    return { url: null, secret: null };
  }
  return { url, secret };
};
resolveRevalidate(); // fail fast at startup

const config = {
  env,
  isProd,
  isTest,
  port: int(process.env.PORT, 5000),

  // Number of reverse-proxy hops in front of the API (Caddy = 1,
  // Cloudflare → Caddy = 2). Needed for correct client IPs in rate limiting.
  trustProxy: int(process.env.TRUST_PROXY, isProd ? 1 : 0),

  db: {
    url: process.env.DATABASE_URL,
    // 20 absorbs page-refresh bursts from the storefront; Postgres allows 100.
    poolMax: int(process.env.DB_POOL_MAX, 20),
  },

  jwt: {
    secret: resolveJwtSecret(),
    // Customers get long sessions; staff tokens are short-lived.
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    staffExpiresIn: process.env.JWT_STAFF_EXPIRES_IN || '12h',
  },

  cors: {
    // Comma-separated list: storefront domain(s) + the local admin origin.
    origins: list(process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173'),
  },

  // Shared secret the storefront's server-side fetches send (X-Internal-Key)
  // so SSR traffic from shared hosting IPs isn't rate-limited as one client.
  internalApiKey: resolveInternalKey(),

  sslcommerz: {
    storeId: process.env.SSLCOMMERZ_STORE_ID,
    storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD,
    isSandbox: resolveSandbox(),
  },

  // Public base URLs used to build SSLCommerz callback URLs and the final
  // browser redirect back to the storefront.
  urls: {
    // Where the gateway POSTs success/fail/cancel/ipn (browser-reachable API base).
    serverPublic: process.env.SERVER_PUBLIC_URL || 'http://localhost:5001/api/v1',
    // Where the user's browser is sent after the payment is settled.
    storefront: process.env.STOREFRONT_URL || 'http://localhost:3000',
  },

  // Object storage for product images (Cloudflare R2, S3-compatible).
  storage: {
    driver: process.env.STORAGE_DRIVER || (process.env.R2_BUCKET ? 'r2' : 'local'),
    r2: {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      // Public URL of the bucket (r2.dev subdomain or custom domain), no trailing slash.
      publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    },
  },

  sms: {
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID || 'PremiumGadget',
  },

  pos: {
    // Max % below the effective price a branch_admin may sell at (price
    // overrides + manual discount combined). super_admin is not capped.
    // (Getter so it can be changed at runtime in tests.)
    get maxStaffDiscountPct() {
      const n = Number(process.env.POS_MAX_STAFF_DISCOUNT_PCT);
      return process.env.POS_MAX_STAFF_DISCOUNT_PCT && Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10;
    },
  },

  // Storefront on-demand revalidation (POST { tags } to the Next.js
  // /api/revalidate route after catalog/banner/settings writes). Disabled
  // unless both are set (see resolveRevalidate).
  revalidate: {
    get url() {
      return resolveRevalidate({ quiet: true }).url;
    },
    get secret() {
      return resolveRevalidate({ quiet: true }).secret;
    },
  },

  // Background jobs (reservation expiry etc.). Disabled in tests.
  jobs: {
    enabled: bool('JOBS_ENABLED', !isTest),
  },
};

module.exports = config;
