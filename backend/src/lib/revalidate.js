const config = require('../config');

/**
 * Storefront on-demand revalidation.
 *
 * The storefront caches catalog pages with Next.js tags (`products`,
 * `product:<slug>`, `categories`, `brands`, `banners`, `settings`). After a
 * write, the API POSTs the affected tags to the storefront's
 * /api/revalidate route so customers see the change without waiting for the
 * time-based revalidation.
 *
 * Fire-and-forget: revalidate() never throws or rejects, and the request is
 * sent on a later tick, so it never delays or fails the API response. A
 * missed revalidation only means a page stays stale until its normal
 * revalidate window. Disabled unless STOREFRONT_REVALIDATE_URL and
 * REVALIDATE_SECRET are both set.
 */

const TIMEOUT_MS = 3000;
const MAX_TAGS = 64;
// Next.js caps tags at 256 chars; slugs are [a-z0-9-].
const TAG_RE = /^[a-z0-9_:-]{1,256}$/i;

const TAGS = Object.freeze({
  products: 'products',
  categories: 'categories',
  brands: 'brands',
  banners: 'banners',
  collections: 'collections',
  settings: 'settings',
});

/** Cache tag of one product page. */
const productTag = (slug) => `product:${slug}`;

/** Cache tag of one collection page. */
const collectionTag = (slug) => `collection:${slug}`;

/**
 * Tags for a write to one or more products. Banners embed product prices,
 * images and stock, so they are revalidated too.
 * @param {...(string|null|undefined)} slugs
 */
// Collections list product cards (price, stock, badges), so they refresh with products.
const productTags = (...slugs) => [
  TAGS.products, TAGS.banners, TAGS.collections, ...slugs.filter(Boolean).map(productTag),
];

const inflight = new Set();

const errorText = (err) =>
  err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timed out' : err?.message || 'failed';

const send = async (tags) => {
  const { url, secret } = config.revalidate;
  if (!url || !secret) return false;

  const list = [...new Set((Array.isArray(tags) ? tags : [tags]).filter((t) => typeof t === 'string' && TAG_RE.test(t)))]
    .slice(0, MAX_TAGS);
  if (!list.length) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: list }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Custom headers survive cross-origin redirects; never forward the secret.
      redirect: 'error',
    });
    try {
      await res.body?.cancel?.();
    } catch {
      // the response body is irrelevant
    }
    if (!res.ok) {
      console.warn(`⚠️  storefront revalidation rejected (HTTP ${res.status}) for ${list.join(', ')}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`⚠️  storefront revalidation ${errorText(err)} for ${list.join(', ')}`);
    return false;
  }
};

/**
 * Ask the storefront to revalidate these cache tags. Call it AFTER the write
 * has committed and don't await it.
 *
 *   revalidate(['categories']);
 *
 * @param {string[]} tags
 * @returns {Promise<boolean>} resolves true if the storefront accepted (never rejects)
 */
const revalidate = (tags) => {
  const p = new Promise((resolve) => {
    setImmediate(() => {
      send(tags).then(resolve, () => resolve(false));
    });
  });
  inflight.add(p);
  p.finally(() => inflight.delete(p));
  return p;
};

/**
 * Promise helper for committed writes: revalidate the tags once the write
 * resolves and pass its value through (a rejected write revalidates nothing).
 *
 *   return withTransaction(...).then(revalidateAfter([TAGS.brands]));
 *
 * @param {string[]} tags
 */
const revalidateAfter = (tags) => (value) => {
  revalidate(tags);
  return value;
};

/** Test hook: wait for every pending revalidation to finish. */
const settle = () => Promise.all([...inflight]);

module.exports = { revalidate, revalidateAfter, productTag, productTags, collectionTag, TAGS, settle, TIMEOUT_MS };
