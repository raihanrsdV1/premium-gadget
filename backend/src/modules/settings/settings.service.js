const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { SETTING_SCHEMAS } = require('./settings.validation');
const { revalidate } = require('../../lib/revalidate');

/**
 * Site settings: small JSON documents keyed by name (store info, social links,
 * shipping zones, checkout rules, SEO defaults), editable by the owner.
 *
 * DEFAULTS mirrors the seed in migration 004 and is used whenever a row is
 * missing, so a fresh or truncated database still has a working checkout.
 */
const DEFAULTS = Object.freeze({
  store: {
    name: 'Premium Gadget',
    phone: '01886670543',
    whatsapp: '01886670543',
    email: null,
    address: 'Shop 451/A, Level 4, Sanmar Ocean City, Nasirabad, Chattogram 4203, Bangladesh',
    hours: null,
    map_url: null,
  },
  social: { facebook: 'https://www.facebook.com/premiumgadget.official/', instagram: null, youtube: null, tiktok: null },
  shipping: {
    zones: [
      // Placeholder fees — the owner sets real ones in Admin → Settings → Delivery.
      { code: 'inside_chattogram', label: 'Inside Chattogram', fee: 100, eta: '1-2 days', districts: ['Chattogram'], divisions: [], is_default: false },
      { code: 'outside_chattogram', label: 'Outside Chattogram', fee: 200, eta: '2-4 days', districts: [], divisions: [], is_default: true },
    ],
    free_shipping_threshold: null,
  },
  // cod_requires_verified_phone stays off until an SMS gateway is connected —
  // otherwise no customer could verify and COD would be unusable.
  checkout: {
    cod_enabled: true,
    cod_requires_verified_phone: false,
    reservation_minutes: 30,
    pending_order_limit: 3,
    cod_confirm_hours: 24,
    max_units_per_order: 5,
    cod_max_order_value: 300000,
  },
  seo: {
    default_title: 'Premium Gadget — New & Used Laptops in Bangladesh',
    default_description:
      'Premium Gadget in Chattogram sells quality new and used laptops and gadgets with warranty, plus expert repairs. Cash on delivery and secure online payment across Bangladesh.',
    og_image: null,
  },
  announcement: { enabled: false, items: [] },
});

const KEYS = Object.keys(DEFAULTS);

const isKnownKey = (key) => Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, key);

// Checkout reads settings on every order; a short TTL keeps that off the DB
// while edits still take effect quickly. Writes invalidate immediately (this
// is a single-process API).
const TTL_MS = 30 * 1000;
const cache = new Map();

const clone = (v) => (v === undefined ? v : structuredClone(v));

const loadFromDb = async (keys) => {
  const { rows } = await query('SELECT key, value FROM site_settings WHERE key = ANY($1)', [keys]);
  const found = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const now = Date.now();
  for (const key of keys) {
    // Shallow-merge over defaults so a field added in a later release has a
    // value before the owner first saves the setting.
    const value = found[key] && typeof found[key] === 'object' && !Array.isArray(found[key])
      ? { ...DEFAULTS[key], ...found[key] }
      : clone(DEFAULTS[key]);
    cache.set(key, { value, at: now });
  }
};

/**
 * Read one setting (cached for 30s). Returns a copy, safe to mutate.
 *
 * @param {'store'|'social'|'shipping'|'checkout'|'seo'|'announcement'} key
 * @returns {Promise<object>}
 */
const getSetting = async (key) => {
  if (!isKnownKey(key)) throw new Error(`Unknown setting "${key}"`);
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) await loadFromDb([key]);
  return clone(cache.get(key).value);
};

/** Every setting, keyed by name. */
const getAll = async () => {
  const stale = KEYS.filter((k) => {
    const hit = cache.get(k);
    return !hit || Date.now() - hit.at > TTL_MS;
  });
  if (stale.length) await loadFromDb(stale);
  return Object.fromEntries(KEYS.map((k) => [k, clone(cache.get(k).value)]));
};

/**
 * The subset the storefront may see. Internal checkout knobs (reservation
 * window, pending-order cap, COD confirmation window) stay private.
 */
const getPublic = async () => {
  const all = await getAll();
  return {
    store: all.store,
    social: all.social,
    shipping: all.shipping,
    // Limits the storefront needs to explain before checkout fails.
    checkout: {
      cod_enabled: all.checkout.cod_enabled,
      cod_requires_verified_phone: all.checkout.cod_requires_verified_phone,
      max_units_per_order: all.checkout.max_units_per_order,
      cod_max_order_value: all.checkout.cod_max_order_value,
    },
    seo: all.seo,
    announcement: all.announcement,
  };
};

/**
 * Replace one setting (value already validated by its key's schema).
 *
 * @param {string} key
 * @param {object} value
 * @param {{ id: string }} actor
 */
const update = async (key, value, actor) => {
  if (!isKnownKey(key)) throw ApiError.notFound('Unknown setting');
  const row = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by
       RETURNING key, value, updated_at`,
      [key, JSON.stringify(value), actor.id]
    );
    await audit({ actor, action: 'settings.update', entity: 'site_setting', data: { key, value }, db: client });
    return rows[0];
  });
  cache.delete(key);
  revalidate(['settings']);
  return { key: row.key, value: row.value, updated_at: row.updated_at };
};

/** Test hook: forget cached values (e.g. after truncating tables). */
const _clearCache = () => cache.clear();

module.exports = { DEFAULTS, KEYS, isKnownKey, getSetting, getAll, getPublic, update, _clearCache };
