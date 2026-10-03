const crypto = require('crypto');
const { promisify } = require('util');
const bcrypt = require('bcryptjs');

/**
 * Password hashing with Node's built-in scrypt.
 *
 * scrypt runs on libuv's thread pool, so a burst of login attempts can't
 * freeze the event loop the way pure-JS bcrypt does (each bcryptjs cost-12
 * hash blocks the API for ~0.5 s). Format:
 *
 *   scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64>
 *
 * Legacy bcrypt hashes ($2a$/$2b$, from older seeds or tests) still verify;
 * `needsRehash` tells the login flow to upgrade them.
 */
const scrypt = promisify(crypto.scrypt);

const LOG_N = 15; // N = 32768 → ~32 MB per hash, ~50–100 ms
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { N: 2 ** LOG_N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
};

/**
 * Constant-time verification. Returns false (never throws) for malformed or
 * unknown hash formats.
 */
const verifyPassword = async (password, stored) => {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('$2')) return bcrypt.compare(password, stored);

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logN, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const params = { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: MAXMEM };
  if (!Number.isInteger(params.r) || !Number.isInteger(params.p) || Number(logN) > 20) return false;
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, params);
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
};

/** True when a stored hash should be replaced with a current-format one. */
const needsRehash = (stored) =>
  typeof stored === 'string' && !stored.startsWith(`scrypt$${LOG_N}$${R}$${P}$`);

// Verified against when the account doesn't exist, so response timing
// doesn't reveal which phone numbers are registered.
let dummyHash;
const getDummyHash = async () => {
  dummyHash = dummyHash || (await hashPassword(crypto.randomBytes(16).toString('hex')));
  return dummyHash;
};

module.exports = { hashPassword, verifyPassword, needsRehash, getDummyHash };
