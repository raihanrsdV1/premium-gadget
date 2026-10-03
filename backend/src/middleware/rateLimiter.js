const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const isInternal = (req) => {
  const key = req.get('x-internal-key');
  if (!config.internalApiKey || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(config.internalApiKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Client key for per-IP limits. IPv6 clients usually control a whole /64,
 * so they're grouped by that prefix — otherwise rotating addresses would
 * reset every limit.
 */
const clientKey = (req) => {
  const ip = req.ip || '';
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip.replace(/^::ffff:/, '');
  const full = ip.split('::');
  const head = full[0] ? full[0].split(':') : [];
  const tail = full.length > 1 && full[1] ? full[1].split(':') : [];
  const groups = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  return `${groups.slice(0, 4).join(':')}::/64`;
};

const phoneOf = (req) => String(req.body?.phone || '').replace(/\D/g, '').slice(-11);

// Tests exercise endpoints far faster than any human; limiters are opted back
// in per-test via TEST_RATE_LIMIT=1.
const skipInTest = () => config.isTest && process.env.TEST_RATE_LIMIT !== '1';

const make = ({ windowMs, max, message, keyGenerator = clientKey, skip, ...rest }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    keyGenerator,
    skip: (req, res) => skipInTest() || (skip ? skip(req, res) : false),
    ...rest,
  });

/**
 * Global per-IP limiter. Generous: a single phone browsing the catalog makes
 * many requests, and mobile carriers in BD put many users behind one CGNAT IP.
 * Storefront SSR (X-Internal-Key) is exempt from THIS limiter only — never
 * from the auth / form / lookup limiters below.
 */
const rateLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: 'Too many requests, please try again later.',
  skip: (req) => req.path === '/api/v1/health' || isInternal(req),
});

/** Per-IP limiter for auth endpoints (register/login/OTP/password reset). */
const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many auth attempts, please try again later.',
});

/**
 * Brute-force protection for one phone number that an attacker can't turn
 * into a lockout of the real owner:
 *   - only FAILED attempts count (a correct login never uses up the budget)
 *   - the tight limit is per phone+IP, so failures from an attacker's IPs
 *     don't block the owner's own network
 *   - a looser phone-wide cap still slows distributed guessing
 * Returns the two middlewares to mount in order.
 */
const failedAttemptLimiter = ({ perIp = 10, perPhone = 100, windowMs = 15 * 60 * 1000 } = {}) => [
  make({
    windowMs,
    max: perIp,
    skipSuccessfulRequests: true,
    message: 'Too many failed attempts. Please wait a few minutes and try again.',
    keyGenerator: (req) => `phone-ip:${phoneOf(req)}:${clientKey(req)}`,
  }),
  make({
    windowMs: 60 * 60 * 1000,
    max: perPhone,
    skipSuccessfulRequests: true,
    message: 'Too many failed attempts for this phone number. Please try again later.',
    keyGenerator: (req) => `phone:${phoneOf(req)}`,
  }),
];

/**
 * Limit for requesting OTP codes, per phone+IP (the OTP service also enforces
 * a per-phone cooldown and hourly cap in the database).
 */
const otpRequestLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many codes requested. Please try again later.',
  keyGenerator: (req) => `otp:${phoneOf(req)}:${clientKey(req)}`,
});

/** Public form endpoints that create records (repair booking, reviews). */
const formLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many submissions, please try again later.',
});

/** Public lookups keyed by guessable identifiers (repair tracking, coupon checks). */
const lookupLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many lookups, please try again later.',
});

/**
 * Commerce limiters (one export, owned by the commerce workstream).
 *
 * couponAttempt: checkout must not double as a coupon-guessing oracle. Only
 *   FAILED checkouts that carry a coupon_code count, so normal shopping is
 *   never limited.
 * paymentCallback: the unauthenticated gateway callbacks (success / fail /
 *   cancel / IPN). Generous — real traffic is a few requests per order — but
 *   it bounds how often anyone can make us query the gateway.
 */
const commerceLimiters = {
  couponAttempt: make({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    message: 'Too many attempts with coupon codes. Please wait a few minutes and try again.',
    keyGenerator: (req) => `coupon-checkout:${clientKey(req)}`,
    skip: (req) => !(req.body && typeof req.body === 'object' && req.body.coupon_code),
  }),
  paymentCallback: make({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests, please try again later.',
    keyGenerator: (req) => `payment-callback:${clientKey(req)}`,
  }),
};

module.exports = {
  commerceLimiters,
  rateLimiter,
  authLimiter,
  failedAttemptLimiter,
  otpRequestLimiter,
  formLimiter,
  lookupLimiter,
  isInternal,
  clientKey,
};
