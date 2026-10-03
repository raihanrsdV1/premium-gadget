jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { api, query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const expiry = require('../../src/jobs/reservationExpiry');

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
beforeEach(h.reset);

const DAY = 24 * 3600 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const base = (overrides = {}) => ({
  code: 'welcome10',
  discount_type: 'percentage',
  discount_value: 10,
  valid_from: iso(-DAY),
  valid_until: iso(30 * DAY),
  ...overrides,
});

/** Insert a coupon directly. */
const coupon = async (overrides = {}) => {
  const c = { ...base(), code: 'SAVE', ...overrides };
  const { rows } = await query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_order_value, max_uses, max_discount,
                          per_user_limit, channel, valid_from, valid_until, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [c.code, c.discount_type, c.discount_value, c.min_order_value ?? 0, c.max_uses ?? null, c.max_discount ?? null,
     c.per_user_limit ?? null, c.channel ?? 'all', c.valid_from, c.valid_until, c.is_active ?? true]
  );
  return rows[0];
};
const usedCount = async (id) => (await query('SELECT used_count FROM coupons WHERE id = $1', [id])).rows[0].used_count;

describe('coupon admin — authz', () => {
  test('reads: staff only; writes: super_admin only', async () => {
    const c = await coupon();
    const cust = await f.user();
    const ba = await f.user({ role: 'branch_admin', branch_id: (await f.branch()).id });
    const sa = await f.user({ role: 'super_admin' });

    await api.get('/api/v1/coupons').expect(401);
    await api.get('/api/v1/coupons').set(f.auth(cust.token)).expect(403);
    await api.get(`/api/v1/coupons/${c.id}`).set(f.auth(cust.token)).expect(403);
    await api.get('/api/v1/coupons').set(f.auth(ba.token)).expect(200);
    await api.get(`/api/v1/coupons/${c.id}`).set(f.auth(ba.token)).expect(200);

    for (const t of [cust.token, ba.token]) {
      await api.post('/api/v1/coupons').set(f.auth(t)).send(base()).expect(403);
      await api.put(`/api/v1/coupons/${c.id}`).set(f.auth(t)).send({ discount_value: 50 }).expect(403);
      await api.delete(`/api/v1/coupons/${c.id}`).set(f.auth(t)).expect(403);
    }
    await api.post('/api/v1/coupons').send(base()).expect(401);
    await api.post('/api/v1/coupons').set(f.auth(sa.token)).send(base()).expect(201);
    expect(await usedCount(c.id)).toBe(0);
  });
});

describe('coupon admin — create / update / delete', () => {
  let sa;
  beforeEach(async () => { sa = await f.user({ role: 'super_admin' }); });
  const post = (body) => api.post('/api/v1/coupons').set(f.auth(sa.token)).send(body);

  test('create normalises the code, applies defaults, audits', async () => {
    const res = await post(base({ code: '  welcome10 ', max_discount: 1000, per_user_limit: 1, max_uses: 100, channel: 'online' })).expect(201);
    expect(res.body.data).toMatchObject({
      code: 'WELCOME10', discount_type: 'percentage', discount_value: '10.00', min_order_value: '0.00',
      max_discount: '1000.00', per_user_limit: 1, max_uses: 100, channel: 'online', is_active: true, used_count: 0, redemption_count: 0,
    });
    const audit = (await query(`SELECT * FROM admin_audit_log WHERE action = 'coupon.create'`)).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(sa.user.id);
  });

  test('codes are unique case-insensitively', async () => {
    await post(base()).expect(201);
    await post(base({ code: 'WELCOME10' })).expect(409);
    await post(base({ code: 'Welcome10' })).expect(409);
  });

  test.each([
    ['2-char code', { code: 'AB' }],
    ['code with spaces', { code: 'WEL COME' }],
    ['code with symbols', { code: 'SAVE$10' }],
    ['41-char code', { code: 'A'.repeat(41) }],
    ['percentage 0', { discount_value: 0 }],
    ['percentage 101', { discount_value: 101 }],
    ['percentage 0.5', { discount_value: 0.5 }],
    ['fixed 0', { discount_type: 'fixed', discount_value: 0 }],
    ['negative value', { discount_type: 'fixed', discount_value: -5 }],
    ['3 decimals', { discount_type: 'fixed', discount_value: 1.005 }],
    ['unknown type', { discount_type: 'bogo' }],
    ['until before from', { valid_from: iso(DAY), valid_until: iso(0) }],
    ['until equals from', { valid_from: '2026-10-01T00:00:00Z', valid_until: '2026-10-01T00:00:00Z' }],
    ['date-only string', { valid_from: '2026-10-01' }],
    ['max_uses 0', { max_uses: 0 }],
    ['per_user_limit 0', { per_user_limit: 0 }],
    ['max_discount 0', { max_discount: 0 }],
    ['negative min order', { min_order_value: -1 }],
    ['bad channel', { channel: 'shop' }],
    ['array code', { code: ['A', 'B'] }],
    ['string number', { discount_value: '10' }],
  ])('%s → 400', async (_, patch) => {
    await post(base(patch)).expect(400);
  });

  test('update: partial, merged rules re-checked, code conflicts, 404', async () => {
    const a = (await post(base({ code: 'AAA' }))).body.data;
    await post(base({ code: 'BBB' })).expect(201);
    const put = (id, body) => api.put(`/api/v1/coupons/${id}`).set(f.auth(sa.token)).send(body);

    const res = await put(a.id, { discount_value: 25, description: 'Eid sale', used_count: 999 }).expect(200);
    expect(res.body.data).toMatchObject({ discount_value: '25.00', description: 'Eid sale', used_count: 0, code: 'AAA' });
    await put(a.id, { discount_value: 150 }).expect(400); // percentage > 100
    await put(a.id, { discount_type: 'fixed', discount_value: 500 }).expect(200);
    await put(a.id, { discount_type: 'percentage' }).expect(400); // 500% after merge
    await put(a.id, { valid_until: iso(-2 * DAY) }).expect(400); // before valid_from
    await put(a.id, { code: 'bbb' }).expect(409);
    await put(a.id, { code: 'aaa' }).expect(200); // its own code is fine
    await put(a.id, {}).expect(400);
    await put('00000000-0000-4000-8000-000000000000', { description: 'x' }).expect(404);
    await put('nope', { description: 'x' }).expect(400);
  });

  test('delete: unused → deleted; used → deactivated instead', async () => {
    const unused = await coupon({ code: 'UNUSED' });
    const used = await coupon({ code: 'USED' });
    const { variant } = await h.shop();
    const c = await f.user();
    await h.placeOrder(c.token, variant, { coupon_code: 'used' });

    const del1 = await api.delete(`/api/v1/coupons/${unused.id}`).set(f.auth(sa.token)).expect(200);
    expect(del1.body).toMatchObject({ data: { deleted: true, deactivated: false }, message: 'Coupon deleted' });
    expect((await query('SELECT 1 FROM coupons WHERE id = $1', [unused.id])).rowCount).toBe(0);

    const del2 = await api.delete(`/api/v1/coupons/${used.id}`).set(f.auth(sa.token)).expect(200);
    expect(del2.body.data).toEqual({ deleted: false, deactivated: true });
    expect(del2.body.message).toMatch(/deactivated/);
    expect((await query('SELECT is_active FROM coupons WHERE id = $1', [used.id])).rows[0].is_active).toBe(false);
    await api.delete(`/api/v1/coupons/${unused.id}`).set(f.auth(sa.token)).expect(404);
  });
});

describe('coupon admin — list / detail', () => {
  test('filters by status, channel and q; includes redemption counts', async () => {
    const sa = await f.user({ role: 'super_admin' });
    const active = await coupon({ code: 'ACTIVE', channel: 'online' });
    await coupon({ code: 'EXPIRED', valid_from: iso(-10 * DAY), valid_until: iso(-DAY) });
    await coupon({ code: 'OFF', is_active: false });
    await coupon({ code: 'SOON', valid_from: iso(DAY), valid_until: iso(10 * DAY) });
    await coupon({ code: 'PCT_100' });
    const { variant } = await h.shop();
    await h.placeOrder((await f.user()).token, variant, { coupon_code: 'active' });

    const codes = async (qs) => (await api.get(`/api/v1/coupons?${qs}`).set(f.auth(sa.token)).expect(200)).body.data.map((c) => c.code).sort();
    expect(await codes('status=active')).toEqual(['ACTIVE', 'PCT_100']);
    expect(await codes('status=expired')).toEqual(['EXPIRED']);
    expect(await codes('status=inactive')).toEqual(['OFF']);
    expect(await codes('status=scheduled')).toEqual(['SOON']);
    expect(await codes('channel=online')).toEqual(['ACTIVE']);
    expect(await codes('q=act')).toEqual(['ACTIVE']);
    expect(await codes('q=_')).toEqual(['PCT_100']); // literal underscore
    const page = await api.get('/api/v1/coupons?limit=2&page=3').set(f.auth(sa.token)).expect(200);
    expect(page.body.pagination).toMatchObject({ total: 5, page: 3 });
    expect(page.body.data).toHaveLength(1);

    const one = await api.get(`/api/v1/coupons/${active.id}`).set(f.auth(sa.token)).expect(200);
    expect(one.body.data).toMatchObject({ code: 'ACTIVE', used_count: 1, redemption_count: 1 });
    await api.get('/api/v1/coupons/00000000-0000-4000-8000-000000000000').set(f.auth(sa.token)).expect(404);
    await api.get('/api/v1/coupons?status=active&status=expired').set(f.auth(sa.token)).expect(400);
    await api.get('/api/v1/coupons?limit=500').set(f.auth(sa.token)).expect(400);
  });
});

describe('POST /coupons/validate (customer cart check)', () => {
  const check = (token, body) => api.post('/api/v1/coupons/validate').set(token ? f.auth(token) : {}).send(body);

  test('prices the cart server-side and reserves nothing', async () => {
    const { variant, branch } = await h.shop({ price: 50000 });
    await query(`UPDATE product_variants SET sale_price = 40000 WHERE id = $1`, [variant.id]);
    const w = await h.variantAt(branch.id, { price: 1500 });
    const c = await coupon({ code: 'TEN', max_discount: 5000 });
    const { token } = await f.user();
    const res = await check(token, {
      code: ' ten ', items: [{ variant_id: variant.id, quantity: 2, price: 1 }, { variant_id: w.id, quantity: 1 }],
    }).expect(200);
    expect(res.body.data).toEqual({ code: 'TEN', discount: 5000, subtotal: 81500, total_before_shipping: 76500 });
    expect(await usedCount(c.id)).toBe(0);
    expect((await query('SELECT COUNT(*)::int AS n FROM coupon_redemptions')).rows[0].n).toBe(0);
  });

  test('rejections explain actionable reasons; unknown and inactive codes look the same', async () => {
    const { variant } = await h.shop({ price: 1000 });
    const { user, token } = await f.user();
    await coupon({ code: 'OLD', valid_from: iso(-10 * DAY), valid_until: iso(-DAY) });
    await coupon({ code: 'OFF', is_active: false });
    await coupon({ code: 'POSONLY', channel: 'pos' });
    await coupon({ code: 'BIGCART', min_order_value: 5000 });
    const full = await coupon({ code: 'FULL', max_uses: 1 });
    await query('UPDATE coupons SET used_count = 1 WHERE id = $1', [full.id]);
    const mine = await coupon({ code: 'ONCEEACH', per_user_limit: 1 });
    const o = await h.placeOrder(token, variant, { coupon_code: 'ONCEEACH' });
    expect(o).toBeTruthy();
    expect(mine.id).toBeTruthy();
    expect(user.id).toBeTruthy();

    const msg = async (code) =>
      (await check(token, { code, items: [{ variant_id: variant.id, quantity: 1 }] }).expect(400)).body.message;
    expect(await msg('NOPE')).toBe(await msg('OFF'));
    expect(await msg('OLD')).toMatch(/expired/);
    // An online customer can't tell a POS-only code from an unknown one.
    expect(await msg('POSONLY')).toBe(await msg('NOPE'));
    expect(await msg('BIGCART')).toMatch(/at least ৳5000/);
    expect(await msg('FULL')).toMatch(/usage limit/);
    expect(await msg('ONCEEACH')).toMatch(/already used/);
  });

  test('authz and validation', async () => {
    const { variant } = await h.shop();
    const { token } = await f.user();
    await check(null, { code: 'X', items: [{ variant_id: variant.id, quantity: 1 }] }).expect(401);
    await check(token, { code: 'X', items: [] }).expect(400);
    await check(token, { code: 'X', items: [{ variant_id: variant.id, quantity: 11 }] }).expect(400);
    await check(token, { code: ['X'], items: [{ variant_id: variant.id, quantity: 1 }] }).expect(400);
    await check(token, { code: 'X', items: [{ variant_id: variant.id, quantity: 1 }, { variant_id: variant.id, quantity: 1 }] }).expect(400);
    await check(token, { code: 'X', items: [{ variant_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }).expect(400);
  });

  test('rate limited (lookupLimiter)', async () => {
    const old = process.env.TEST_RATE_LIMIT;
    process.env.TEST_RATE_LIMIT = '1';
    try {
      const { variant } = await h.shop();
      const { token } = await f.user();
      let last;
      for (let i = 0; i < 61; i++) {
        last = await check(token, { code: 'NOPE', items: [{ variant_id: variant.id, quantity: 1 }] });
      }
      expect(last.status).toBe(429);
    } finally {
      process.env.TEST_RATE_LIMIT = old;
    }
  });
});

describe('coupon caps at checkout', () => {
  test('max_uses holds under concurrency', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 20 });
    const c = await coupon({ code: 'TWO', max_uses: 2 });
    const users = await Promise.all(Array.from({ length: 8 }, () => f.user()));
    const results = await Promise.all(users.map((u) => h.checkout(u.token, h.checkoutBody(variant, { coupon_code: 'TWO' }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(6);
    expect(await usedCount(c.id)).toBe(2);
    expect((await query('SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1', [c.id])).rows[0].n).toBe(2);
    // the losers' stock reservations were rolled back
    expect((await query('SELECT reserved FROM inventory WHERE variant_id = $1', [variant.id])).rows[0].reserved).toBe(2);
  });

  test('per_user_limit, including parallel attempts; a released use can be reused', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 20 });
    const c = await coupon({ code: 'ONCE', per_user_limit: 1 });
    const { token } = await f.user();
    const results = await Promise.all(Array.from({ length: 3 }, () => h.checkout(token, h.checkoutBody(variant, { coupon_code: 'ONCE' }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const first = results.find((r) => r.status === 201).body.data;
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'ONCE' })).expect(400);
    await h.placeOrder((await f.user()).token, variant, { coupon_code: 'ONCE' }); // another customer is fine

    // the gateway shows the first attempt failed → released → usable again
    gw.endAttempt(first.order_number, 'FAILED');
    await h.fail({ tran_id: first.order_number }).expect(303);
    expect(await usedCount(c.id)).toBe(1);
    await h.placeOrder(token, variant, { coupon_code: 'ONCE' });
  });

  test('max_discount caps a percentage coupon; fixed never exceeds the subtotal', async () => {
    const { variant } = await h.shop({ price: 50000 });
    await coupon({ code: 'HALF', discount_value: 50, max_discount: 1000 });
    await coupon({ code: 'HUGE', discount_type: 'fixed', discount_value: 99999 });
    const a = await h.placeOrder((await f.user()).token, variant, { coupon_code: 'HALF' });
    expect(a.total).toBe(49100);
    const b = await h.placeOrder((await f.user()).token, variant, { coupon_code: 'HUGE', payment_method: 'cod' });
    expect(b.total).toBe(100);
    expect((await h.orderRow(b.order_id)).discount).toBe('50000.00');
  });

  test('channel and validity rules apply at checkout', async () => {
    const { variant } = await h.shop({ price: 1000 });
    await coupon({ code: 'INSTORE', channel: 'pos' });
    await coupon({ code: 'WEB', channel: 'online' });
    await coupon({ code: 'GONE', valid_from: iso(-10 * DAY), valid_until: iso(-DAY) });
    await coupon({ code: 'MIN', min_order_value: 2000 });
    const { token } = await f.user();
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'INSTORE' })).expect(400);
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'GONE' })).expect(400);
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'MIN' })).expect(400);
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'NOSUCH' })).expect(400);
    const ok = await h.placeOrder(token, variant, { coupon_code: 'web' });
    expect(ok.total).toBe(1000);
  });

  test('released on expiry', async () => {
    const { variant } = await h.shop({ price: 1000 });
    const c = await coupon({ code: 'EXP', max_uses: 1 });
    const o = await h.placeOrder((await f.user()).token, variant, { coupon_code: 'EXP' });
    expect(await usedCount(c.id)).toBe(1);
    await h.checkout((await f.user()).token, h.checkoutBody(variant, { coupon_code: 'EXP' })).expect(400);
    await h.age(o.order_id, 91); // payment page left open → released at the hard cap
    await expiry.run();
    expect(await usedCount(c.id)).toBe(0);
    expect((await query('SELECT released_at FROM coupon_redemptions WHERE order_id = $1', [o.order_id])).rows[0].released_at).toBeTruthy();
    await h.placeOrder((await f.user()).token, variant, { coupon_code: 'EXP' });
  });

  test('a paid order keeps its coupon use', async () => {
    const { variant } = await h.shop({ price: 1000 });
    const c = await coupon({ code: 'KEEP' });
    const o = await h.placeOrder((await f.user()).token, variant, { coupon_code: 'KEEP' });
    const p = gw.pay(o);
    await h.success({ val_id: p.val_id }).expect(303);
    await h.age(o.order_id, 120);
    await expiry.run();
    expect(await usedCount(c.id)).toBe(1);
  });
});
