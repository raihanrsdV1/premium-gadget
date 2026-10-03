const fs = require('fs');
const path = require('path');
const { api, query, factories: f } = require('../helpers');
const h = require('./_helpers');
const settings = require('../../src/modules/settings/settings.service');

beforeEach(h.reset);

const PUBLIC_KEYS = ['announcement', 'checkout', 'seo', 'shipping', 'social', 'store'];

describe('GET /settings (public)', () => {
  test('defaults with only public keys and a short public cache', async () => {
    const res = await api.get('/api/v1/settings').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(Object.keys(res.body.data).sort()).toEqual(PUBLIC_KEYS);
    expect(res.body.data.checkout).toEqual({
      cod_enabled: true, cod_requires_verified_phone: false, max_units_per_order: 5, cod_max_order_value: 300000,
    });
    expect(res.body.data.store).toMatchObject({
      name: 'Premium Gadget', phone: '01886670543', whatsapp: '01886670543',
      address: 'Shop 451/A, Level 4, Sanmar Ocean City, Nasirabad, Chattogram 4203, Bangladesh',
    });
    expect(res.body.data.shipping.zones.map((z) => [z.code, z.fee, z.districts, z.is_default])).toEqual([
      ['inside_chattogram', 100, ['Chattogram'], false], ['outside_chattogram', 200, [], true],
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/reservation_minutes|pending_order_limit|cod_confirm_hours|updated_by/);
  });

  const migration = (file) => fs.readFileSync(path.join(__dirname, '../../src/db/migrations', file), 'utf8');

  test('migrations 004 + 007 + 008 seed the same defaults and are idempotent', async () => {
    for (let i = 0; i < 2; i++) { // re-running is a no-op
      await query(migration('004_commerce.sql'));
      await query(migration('010_collections.sql'));
      await query(migration('007_commerce_review.sql'));
      await query(migration('008_chattogram_defaults.sql'));
    }
    const { rows } = await query('SELECT key, value FROM site_settings ORDER BY key');
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual(settings.DEFAULTS);
  });

  test('007 upgrades the original 004 seed but keeps owner edits', async () => {
    const oldShipping = {
      zones: [
        { code: 'inside_dhaka', label: 'Inside Dhaka', fee: 100, eta: '1-2 days' },
        { code: 'outside_dhaka', label: 'Outside Dhaka', fee: 200, eta: '2-4 days' },
      ],
      free_shipping_threshold: null,
    };
    await h.setSetting('shipping', oldShipping);
    await h.setSetting('checkout', { cod_enabled: false, reservation_minutes: 45, pending_order_limit: 2 });
    await query(migration('007_commerce_review.sql'));
    await query(migration('008_chattogram_defaults.sql'));
    const get = async (k) => (await query('SELECT value FROM site_settings WHERE key = $1', [k])).rows[0].value;
    expect(await get('shipping')).toEqual(settings.DEFAULTS.shipping);
    expect(await get('checkout')).toEqual({
      cod_enabled: false, reservation_minutes: 45, pending_order_limit: 2,
      cod_confirm_hours: 24, max_units_per_order: 5, cod_max_order_value: 300000,
    });

    const edited = { ...oldShipping, free_shipping_threshold: 5000 };
    await h.setSetting('shipping', edited);
    await query(migration('007_commerce_review.sql'));
    await query(migration('008_chattogram_defaults.sql'));
    expect(await get('shipping')).toEqual(edited);
  });
});

describe('GET /settings/admin', () => {
  test('staff only; includes private checkout knobs; not cached', async () => {
    await api.get('/api/v1/settings/admin').expect(401);
    await api.get('/api/v1/settings/admin').set(f.auth((await f.user()).token)).expect(403);
    const ba = await f.user({ role: 'branch_admin', branch_id: (await f.branch()).id });
    const res = await api.get('/api/v1/settings/admin').set(f.auth(ba.token)).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.checkout).toEqual({
      cod_enabled: true, cod_requires_verified_phone: false, reservation_minutes: 30, pending_order_limit: 3,
      cod_confirm_hours: 24, max_units_per_order: 5, cod_max_order_value: 300000,
    });
  });
});

describe('PUT /settings/:key', () => {
  let sa;
  beforeEach(async () => { sa = await f.user({ role: 'super_admin' }); });
  const put = (key, body, token = sa.token) => api.put(`/api/v1/settings/${key}`).set(f.auth(token)).send(body);

  const shipping = {
    zones: [
      { code: 'ctg_city', label: 'Chattogram city', fee: 60, eta: 'Same day', districts: ['Chattogram'] },
      { code: 'outside_ctg', label: 'Outside Chattogram', fee: 150, is_default: true },
    ],
    free_shipping_threshold: 100000,
  };

  test('super_admin only', async () => {
    await api.put('/api/v1/settings/shipping').send(shipping).expect(401);
    await put('shipping', shipping, (await f.user()).token).expect(403);
    await put('shipping', shipping, (await f.user({ role: 'branch_admin', branch_id: (await f.branch()).id })).token).expect(403);
  });

  test('saves, audits, and takes effect immediately (cache invalidated)', async () => {
    await api.get('/api/v1/settings').expect(200); // warm the cache
    const res = await put('shipping', shipping).expect(200);
    expect(res.body.data).toMatchObject({
      key: 'shipping',
      value: {
        ...shipping,
        zones: [
          { ...shipping.zones[0], divisions: [], is_default: false },
          { ...shipping.zones[1], eta: null, districts: [], divisions: [] },
        ],
      },
    });

    const pub = await api.get('/api/v1/settings').expect(200);
    expect(pub.body.data.shipping.zones.map((z) => z.code)).toEqual(['ctg_city', 'outside_ctg']);
    const row = (await query(`SELECT updated_by FROM site_settings WHERE key = 'shipping'`)).rows[0];
    expect(row.updated_by).toBe(sa.user.id);
    const audit = (await query(`SELECT data FROM admin_audit_log WHERE action = 'settings.update'`)).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].data.key).toBe('shipping');
  });

  test('store: phones normalised, nullable fields optional', async () => {
    const res = await put('store', { name: 'Premium Gadget', phone: '+880 1886-670543', email: 'hello@premiumgadget.com.bd' }).expect(200);
    expect(res.body.data.value).toEqual({
      name: 'Premium Gadget', phone: '01886670543', whatsapp: null, email: 'hello@premiumgadget.com.bd',
      address: null, hours: null, map_url: null,
    });
  });

  test('checkout settings drive checkout behaviour', async () => {
    await put('checkout', { cod_enabled: false, reservation_minutes: 15, pending_order_limit: 2 }).expect(200);
    const pub = await api.get('/api/v1/settings').expect(200);
    expect(pub.body.data.checkout).toEqual({
      cod_enabled: false, cod_requires_verified_phone: false, max_units_per_order: 5, cod_max_order_value: 300000,
    });
    expect(await settings.getSetting('checkout')).toEqual({
      cod_enabled: false, cod_requires_verified_phone: false, reservation_minutes: 15, pending_order_limit: 2,
      cod_confirm_hours: 24, max_units_per_order: 5, cod_max_order_value: 300000,
    });
  });

  test.each([
    ['nope', {}],
    ['__proto__', {}],
    ['constructor', {}],
    ['hasOwnProperty', {}],
  ])('unknown key %s → 404', async (key, body) => {
    await put(key, body).expect(404);
  });

  test.each([
    ['shipping', { zones: [] }],
    ['shipping', { zones: [{ code: 'Inside Dhaka', label: 'x', fee: 1 }] }],
    ['shipping', { zones: [{ code: 'a', label: 'x', fee: -1 }] }],
    ['shipping', { zones: [{ code: 'a', label: 'x', fee: '100' }] }],
    ['shipping', { zones: [{ code: 'a', label: 'x', fee: 1 }, { code: 'a', label: 'y', fee: 2 }] }],
    ['shipping', { zones: [{ code: 'a', label: 'x', fee: 1, extra: true }] }],
    ['shipping', { zones: [{ code: 'a', label: 'x', fee: 1 }], free_shipping_threshold: 0 }],
    ['shipping', { zones: { code: 'a' } }],
    ['store', { name: '' }],
    ['store', { name: 'X', phone: '123' }],
    ['store', { name: 'X', map_url: 'javascript:alert(1)' }],
    ['store', { name: 'X', role: 'super_admin' }],
    ['social', { facebook: 'data:text/html,hi' }],
    ['social', { facebook: ['https://fb.com/a'] }],
    ['checkout', { cod_enabled: 'yes', reservation_minutes: 30, pending_order_limit: 3 }],
    ['checkout', { cod_enabled: true, reservation_minutes: 1, pending_order_limit: 3 }],
    ['checkout', { cod_enabled: true, reservation_minutes: 30, pending_order_limit: 0 }],
    ['checkout', { cod_enabled: true }],
    ['seo', { default_title: 'x'.repeat(121), default_description: 'y' }],
  ])('%s %j → 400', async (key, body) => {
    await put(key, body).expect(400);
  });
});
