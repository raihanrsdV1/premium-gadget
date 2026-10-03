const config = require('../../config');
const ApiError = require('../../utils/ApiError');

/**
 * Object storage for uploaded images.
 *
 *   const storage = require('../../lib/storage');
 *   const { url, key } = await storage.put({ key, body, contentType });
 *   await storage.remove(key);
 *
 * The driver is chosen by config.storage.driver ('r2' | 'local') at call
 * time. Production uses Cloudflare R2; the local driver writes to
 * backend/uploads (served at /uploads) and is refused in production because
 * containers there have no persistent disk.
 */

const DRIVERS = {
  r2: () => require('./r2'),
  local: () => require('./local'),
};

// Path-like keys of safe segments, e.g. "products/2026/10/<uuid>.webp".
// No dots outside the final extension, so "..", hidden files and absolute
// paths are impossible.
const KEY_RE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/;

const assertKey = (key) => {
  if (typeof key !== 'string' || key.length > 512 || !KEY_RE.test(key)) {
    throw new Error(`Invalid storage key: ${String(key).slice(0, 80)}`);
  }
};

const driver = () => {
  const make = DRIVERS[config.storage.driver];
  if (!make) throw new ApiError(503, 'Image storage is not configured');
  return make();
};

/**
 * Store an object.
 * @param {{ key: string, body: Buffer, contentType: string }} p
 * @returns {Promise<{ url: string, key: string }>}
 */
const put = async ({ key, body, contentType }) => {
  assertKey(key);
  return driver().put({ key, body, contentType });
};

/**
 * Delete an object. Missing objects are not an error.
 * @param {string} key
 */
const remove = async (key) => {
  assertKey(key);
  return driver().remove(key);
};

module.exports = { put, remove, assertKey };
