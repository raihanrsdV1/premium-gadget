/**
 * Regression tests for the commerce security review (H1, M1, M3, M4, L1–L3).
 * Each test reproduces the original attack and asserts it is now blocked.
 * L4 (untrustworthy gateway answers) is covered end to end in
 * gateway-answers.test.js and at unit level in sslcommerz.client.test.js.
 */
// Honour X-Forwarded-For so rate-limit tests can simulate distinct clients.
process.env.TRUST_PROXY = '1';

jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { api, query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const expiry = require('../../src/jobs/reservationExpiry');

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
beforeEach(h.reset);

const CTG = { ...h.ADDRESS, division: 'Chattogram', district: 'Chattogram', street: 'House 3, Agrabad' };
const DHAKA = { ...h.ADDRESS, division: 'Dhaka', district: 'Dhaka', street: 'Road 4, Banani' };
const patchStatus = (token, id, body) => api.patch(`/api/v1/orders/${id}/status`).set(f.auth(token)).send(body);
let ipSeq = 0;
const freshIp = () => `10.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}.7`;

const withRateLimits = () => {
  let old;
  beforeAll(() => { old = process.env.TEST_RATE_LIMIT; process.env.TEST_RATE_LIMIT = '1'; });
  afterAll(() => { process.env.TEST_RATE_LIMIT = old; });
};

describe('H1: COD stock hoarding', () => {
  test('one unverified account can no longer lock up the stock with COD orders', async () => {
    const { variant, branch } = await h.shop({ price: 1000, quantity: 30 });
    const attacker = await f.user({ phone_verified: false });
    const cod = (qty) => h.checkout(attacker.token, h.checkoutBody(variant, {
      payment_method: 'cod', items: [{ variant_id: variant.id, quantity: qty }],
    }));
    // per-order unit cap (summed quantity)
    expect((await cod(6).expect(400)).body.message).toMatch(/At most 5 items/);
    // the pending-order cap bounds how many such orders one account holds
    for (let i = 0; i < 3; i++) await cod(5).expect(201);
    await cod(5).expect(409);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 15 });

    // ...and unconfirmed COD orders give the stock back after cod_confirm_hours
    await query(`UPDATE orders SET created_at = NOW() - interval '25 hours'`);
    expect(await expiry.run()).toMatchObject({ released: 3 });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 30, reserved: 0 });
    const rows = (await query(`SELECT status, cancel_reason, payment_status FROM orders`)).rows;
    expect(rows).toEqual(Array(3).fill({ status: 'cancelled', cancel_reason: 'expired', payment_status: 'cancelled' }));
  });

  test('the unit cap counts the sum of all lines', async () => {
    const { variant, branch } = await h.shop({ price: 1000, quantity: 10 });
    const w = await h.variantAt(branch.id, { price: 1000, quantity: 10 });
    const { token } = await f.user();
    await h.checkout(token, h.checkoutBody(variant, {
      items: [{ variant_id: variant.id, quantity: 3 }, { variant_id: w.id, quantity: 3 }],
    })).expect(400);
    await h.placeOrder(token, variant, { items: [{ variant_id: variant.id, quantity: 3 }, { variant_id: w.id, quantity: 2 }] });
    await h.setSetting('checkout', { cod_enabled: true, reservation_minutes: 30, pending_order_limit: 3, max_units_per_order: 2 });
    await h.checkout(token, h.checkoutBody(variant, { items: [{ variant_id: variant.id, quantity: 3 }] })).expect(400);
  });

  test('COD is refused above cod_max_order_value (online payment still works)', async () => {
    const { variant } = await h.shop({ price: 200000, quantity: 10 });
    const { token } = await f.user();
    const res = await h.checkout(token, h.checkoutBody(variant, {
      payment_method: 'cod', items: [{ variant_id: variant.id, quantity: 2 }],
    })).expect(400);
    expect(res.body.message).toMatch(/Cash on delivery is available for orders up to ৳300000/);
    await h.placeOrder(token, variant, { items: [{ variant_id: variant.id, quantity: 2 }] }); // card
    await h.placeOrder(token, variant, { payment_method: 'cod' }); // ৳200,100 is under the cap
    await h.setSetting('checkout', { cod_enabled: true, reservation_minutes: 30, pending_order_limit: 5, cod_max_order_value: null });
    await h.placeOrder(token, variant, { payment_method: 'cod', items: [{ variant_id: variant.id, quantity: 2 }] });
  });

  test('cod_confirm_hours is a setting; staff-confirmed COD orders are never released', async () => {
    const { variant, branch } = await h.shop({ quantity: 10 });
    const staff = await f.user({ role: 'branch_admin', branch_id: branch.id });
    await h.setSetting('checkout', { cod_enabled: true, reservation_minutes: 30, pending_order_limit: 3, cod_confirm_hours: 2 });
    const a = await h.placeOrder((await f.user()).token, variant, { payment_method: 'cod' });
    const b = await h.placeOrder((await f.user()).token, variant, { payment_method: 'cod' });
    const c = await h.placeOrder((await f.user()).token, variant, { payment_method: 'cod' });
    await patchStatus(staff.token, b.order_id, { status: 'confirmed' }).expect(200);
    await h.age(a.order_id, 119);
    await h.age(b.order_id, 600);
    await h.age(c.order_id, 121);
    expect(await expiry.run()).toMatchObject({ released: 1 });
    expect((await h.orderRow(a.order_id)).status).toBe('pending');
    expect((await h.orderRow(b.order_id)).status).toBe('confirmed');
    expect((await h.orderRow(c.order_id)).status).toBe('cancelled');
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 9, reserved: 1 });
  });

  test('staff confirming while the job expires the same COD order: exactly one wins', async () => {
    const { variant, branch } = await h.shop({ quantity: 5 });
    const staff = await f.user({ role: 'branch_admin', branch_id: branch.id });
    const o = await h.placeOrder((await f.user()).token, variant, { payment_method: 'cod' });
    await h.age(o.order_id, 25 * 60);
    const [res] = await Promise.all([patchStatus(staff.token, o.order_id, { status: 'confirmed' }), expiry.run()]);
    const row = await h.orderRow(o.order_id);
    if (row.status === 'confirmed') {
      expect(res.status).toBe(200);
      expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
    } else {
      expect(row.status).toBe('cancelled');
      expect(res.status).toBe(409);
      expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 0 });
    }
    const moves = (await query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1`, [o.order_id])).rows[0].n;
    expect(moves).toBe(2);
  });
});

describe('M1: the shipping fee follows the address', () => {
  test('choosing the cheap zone for an outside-Chattogram address is refused', async () => {
    const { variant } = await h.shop({ price: 1000 });
    const { token } = await f.user();
    const res = await h.checkout(token, h.checkoutBody(variant, { shipping_method: 'inside_chattogram', shipping_address: DHAKA })).expect(400);
    expect(res.body.message).toBe("The delivery area doesn't match the address");
    const ok = await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: DHAKA });
    expect(ok.total).toBe(1200);
    expect((await h.orderRow(ok.order_id)).shipping_fee).toBe('200.00');
    // an unknown code is still its own error
    expect((await h.checkout(token, h.checkoutBody(variant, { shipping_method: 'free_zone' })).expect(400)).body.message).toBe('Unknown shipping method');
  });

  test('district beats division beats default; matching ignores case and spaces', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 10 });
    const { token } = await f.user();
    await h.setSetting('shipping', {
      zones: [
        { code: 'gazipur', label: 'Gazipur', fee: 80, districts: ['Gazipur'], divisions: [], is_default: false },
        { code: 'dhaka_div', label: 'Dhaka division', fee: 120, districts: [], divisions: ['Dhaka'], is_default: false },
        { code: 'rest', label: 'Rest', fee: 150, districts: [], divisions: [], is_default: true },
      ],
      free_shipping_threshold: null,
    });
    const at = async (division, district) =>
      (await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: { ...h.ADDRESS, division, district } })).total - 1000;
    expect(await at('Dhaka', ' GAZIPUR ')).toBe(80);
    expect(await at('dhaka', 'Narayanganj')).toBe(120);
    await query(`UPDATE orders SET status = 'cancelled'`); // stay under the pending-order cap
    expect(await at('Khulna', 'Jessore')).toBe(150);
  });

  test('zone settings: exactly one default, no place in two zones, real division names', async () => {
    const sa = await f.user({ role: 'super_admin' });
    const put = (body) => api.put('/api/v1/settings/shipping').set(f.auth(sa.token)).send(body);
    const z = (code, extra = {}) => ({ code, label: code, fee: 100, ...extra });
    await put({ zones: [z('a'), z('b')] }).expect(400); // no default
    await put({ zones: [z('a', { is_default: true }), z('b', { is_default: true })] }).expect(400);
    await put({ zones: [z('a', { districts: ['Dhaka'] }), z('b', { districts: [' dhaka'], is_default: true })] }).expect(400);
    await put({ zones: [z('a', { divisions: ['Sylhet'] }), z('b', { divisions: ['sylhet'], is_default: true })] }).expect(400);
    await put({ zones: [z('a', { divisions: ['Gotham'] }), z('b', { is_default: true })] }).expect(400);
    await put({ zones: [z('a', { districts: 'Dhaka' }), z('b', { is_default: true })] }).expect(400);
    const res = await put({ zones: [z('a', { divisions: ['chittagong'] }), z('b', { is_default: true })] }).expect(200);
    expect(res.body.data.value.zones[0].divisions).toEqual(['Chattogram']);
    const pub = await api.get('/api/v1/settings').expect(200);
    expect(pub.body.data.shipping.zones[1]).toMatchObject({ code: 'b', is_default: true, districts: [], divisions: [] });
  });
});

describe('M3: expiry no longer cancels a customer mid-payment', () => {
  test('an open payment page holds the reservation until reservation + 60 min', async () => {
    const { variant, branch } = await h.shop();
    const o = await h.placeOrder((await f.user()).token, variant);
    await h.age(o.order_id, 45);
    expect(await expiry.run()).toMatchObject({ checked: 1, released: 0, skipped: 1 });
    // the customer finishes paying inside the grace period → confirmed, not "paid after cancel"
    const p = gw.pay(o);
    const res = await h.success({ val_id: p.val_id, tran_id: o.order_number }).expect(303);
    expect(res.headers.location).toContain('/order-success');
    expect(await h.orderRow(o.order_id)).toMatchObject({ status: 'confirmed', system_note: null });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('ended or absent attempts release at the normal time; open ones at the hard cap', async () => {
    const { variant } = await h.shop({ quantity: 10 });
    const ended = await h.placeOrder((await f.user()).token, variant);
    const none = await h.placeOrder((await f.user()).token, variant);
    const open = await h.placeOrder((await f.user()).token, variant);
    gw.endAttempt(ended.order_number, 'FAILED');
    gw.state.attempts.delete(none.order_number);
    for (const o of [ended, none, open]) await h.age(o.order_id, 31);
    expect(await expiry.run()).toMatchObject({ released: 2, skipped: 1 });
    expect((await h.orderRow(open.order_id)).status).toBe('pending');
    await h.age(open.order_id, 91);
    expect(await expiry.run()).toMatchObject({ released: 1 });
    expect((await h.orderRow(open.order_id)).status).toBe('cancelled');
  });

  test('retry is refused when fewer than 10 minutes of the reservation remain', async () => {
    const { variant } = await h.shop();
    const c = await f.user();
    const o = await h.placeOrder(c.token, variant);
    const retry = () => api.post(`/api/v1/payments/retry/${o.order_number}`).set(f.auth(c.token));
    await h.age(o.order_id, 19);
    await retry().expect(200);
    await h.age(o.order_id, 21);
    expect((await retry().expect(409)).body.message).toMatch(/about to expire/);
  });
});

describe('M4: system flags cannot be erased', () => {
  test('a "refund required" flag survives staff note edits; edits are audited with before/after', async () => {
    const { variant, branch } = await h.shop();
    const staff = await f.user({ role: 'branch_admin', branch_id: branch.id });
    const o = await h.placeOrder((await f.user()).token, variant);
    const p = gw.pay(o);
    await h.success({ val_id: p.val_id, tran_id: o.order_number }).expect(303);
    await patchStatus(staff.token, o.order_id, { status: 'cancelled' }).expect(200);
    const flagged = (await h.orderRow(o.order_id)).system_note;
    expect(flagged).toMatch(/refund required/);

    await api.patch(`/api/v1/orders/${o.order_id}`).set(f.auth(staff.token)).send({ admin_note: 'Checked' }).expect(200);
    const res = await api.patch(`/api/v1/orders/${o.order_id}`).set(f.auth(staff.token))
      .send({ admin_note: null, system_note: '', notes: '' }).expect(200);
    expect(res.body.data).toMatchObject({ admin_note: null, system_note: flagged });
    expect((await h.orderRow(o.order_id)).system_note).toBe(flagged);

    const audits = (await query(`SELECT data FROM admin_audit_log WHERE action = 'order.note' ORDER BY created_at`)).rows;
    expect(audits.map((a) => a.data)).toEqual([{ before: null, after: 'Checked' }, { before: 'Checked', after: null }]);

    // still visible to staff in the detail view, never to the customer
    const detail = await api.get(`/api/v1/orders/${o.order_id}`).set(f.auth(staff.token)).expect(200);
    expect(detail.body.data.system_note).toBe(flagged);
  });

  test('POS orders cannot be edited through PATCH /orders/:id', async () => {
    const { branch } = await h.shop();
    const staff = await f.user({ role: 'branch_admin', branch_id: branch.id });
    const { rows: [pos] } = await query(
      `INSERT INTO orders (order_number, branch_id, channel, status, subtotal, total_amount, payment_method, payment_status)
       VALUES ('PG-20261003-900002', $1, 'pos', 'delivered', 100, 100, 'cash', 'completed') RETURNING id`,
      [branch.id]
    );
    await api.patch(`/api/v1/orders/${pos.id}`).set(f.auth(staff.token)).send({ admin_note: 'x' }).expect(409);
  });
});

describe('L1: checkout is not a coupon-guessing oracle', () => {
  withRateLimits();

  test('failed checkouts carrying a coupon_code are limited per client', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 50 });
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('REAL10', 'percentage', 10, NOW() - interval '1 day', NOW() + interval '1 day')`);
    const ip = freshIp();
    const guess = (token, code) => h.checkout(token, h.checkoutBody(variant, { coupon_code: code })).set('X-Forwarded-For', ip);
    const { token } = await f.user();
    for (let i = 0; i < 20; i++) await guess(token, `GUESS${i}`).expect(400);
    // the 21st guess is refused before it reaches the coupon check — even a real code
    await guess(token, 'REAL10').expect(429);
    await guess((await f.user()).token, 'GUESS99').expect(429); // per client, not per account

    // another client is unaffected
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'REAL10' })).set('X-Forwarded-For', freshIp()).expect(201);
  });

  test('successful coupon checkouts and failures without a coupon do not count', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 50 });
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('REAL10', 'percentage', 10, NOW() - interval '1 day', NOW() + interval '1 day')`);
    const ip = freshIp();
    const { token } = await f.user();
    for (let i = 0; i < 25; i++) {
      await h.checkout(token, h.checkoutBody(variant, { shipping_method: 'mars' })).set('X-Forwarded-For', ip).expect(400);
    }
    for (let i = 0; i < 19; i++) {
      await h.checkout(token, h.checkoutBody(variant, { coupon_code: `NOPE${i}` })).set('X-Forwarded-For', ip).expect(400);
    }
    for (let i = 0; i < 3; i++) {
      const u = await f.user();
      await h.checkout(u.token, h.checkoutBody(variant, { coupon_code: 'REAL10' })).set('X-Forwarded-For', ip).expect(201);
    }
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'NOPE20' })).set('X-Forwarded-For', ip).expect(400);
    await h.checkout(token, h.checkoutBody(variant, { coupon_code: 'NOPE21' })).set('X-Forwarded-For', ip).expect(429);
  });
});

describe('L2: callbacks do not reveal whether an order exists', () => {
  test('IPN answers identically for known, unknown, settled and unreachable cases', async () => {
    const { variant } = await h.shop();
    const o = await h.placeOrder((await f.user()).token, variant);
    const p = gw.pay(o);
    const bodies = [];
    for (const body of [
      { tran_id: o.order_number, status: 'FAILED' },
      { tran_id: 'PG-20990101-000001', status: 'FAILED' },
      { val_id: 'unknownval' },
      { val_id: p.val_id },
    ]) {
      const res = await h.ipn(body);
      bodies.push([res.status, res.body]);
    }
    gw.state.down = true;
    const down = await h.ipn({ tran_id: o.order_number });
    bodies.push([down.status, down.body]);
    expect(new Set(bodies.map((b) => JSON.stringify(b)))).toEqual(new Set([JSON.stringify([200, { success: true }])]));
  });

  test('fail / cancel / success redirects have the same shape for known and unknown refs', async () => {
    const { variant } = await h.shop();
    const o = await h.placeOrder((await f.user()).token, variant);
    const unknown = 'PG-20990101-000002';
    const shape = (loc, ref) => loc.replace(encodeURIComponent(ref), '<ref>');
    for (const [call, name] of [[h.fail, 'fail'], [h.cancel, 'cancel']]) {
      const known = (await call({ tran_id: o.order_number }).expect(303)).headers.location;
      const other = (await call({ tran_id: unknown }).expect(303)).headers.location;
      expect([name, shape(known, o.order_number)]).toEqual([name, shape(other, unknown)]);
    }
    const s1 = (await h.success({ val_id: 'nosuchval', tran_id: o.order_number }).expect(303)).headers.location;
    const s2 = (await h.success({ val_id: 'nosuchval', tran_id: unknown }).expect(303)).headers.location;
    expect(shape(s1, o.order_number)).toBe(shape(s2, unknown));
  });

  describe('callback rate limit', () => {
    withRateLimits();
    test('300 callbacks per 15 min per client, then 429', async () => {
      const ip = freshIp();
      for (let i = 0; i < 300; i++) {
        const res = await api.post('/api/v1/payments/fail').type('form').set('X-Forwarded-For', ip).send({ tran_id: 'bad id' });
        expect(res.status).toBe(303);
      }
      await api.post('/api/v1/payments/ipn').type('form').set('X-Forwarded-For', ip).send({ tran_id: 'PG-1' }).expect(429);
      await api.post('/api/v1/payments/success').type('form').set('X-Forwarded-For', ip).send({ val_id: 'x' }).expect(429);
      await api.post('/api/v1/payments/fail').type('form').set('X-Forwarded-For', freshIp()).send({ tran_id: 'PG-1' }).expect(303);
    });
  });
});

describe('L3: multi-branch orders', () => {
  test('any-line branches may read; only a single-branch owner (or super_admin) may change', async () => {
    const a = await f.branch();
    const b = await f.branch();
    const c = await f.branch();
    const va = await h.variantAt(a.id, { price: 1000 });
    const vb = await h.variantAt(b.id, { price: 2000 });
    const order = await h.placeOrder((await f.user()).token, va, {
      payment_method: 'cod', items: [{ variant_id: va.id, quantity: 1 }, { variant_id: vb.id, quantity: 1 }],
    });
    const [ma, mb, mc] = await Promise.all([a, b, c].map((br) => f.user({ role: 'branch_admin', branch_id: br.id })));
    const sa = await f.user({ role: 'super_admin' });

    for (const m of [ma, mb]) {
      await api.get(`/api/v1/orders/${order.order_id}`).set(f.auth(m.token)).expect(200);
      const list = await api.get('/api/v1/orders').set(f.auth(m.token)).expect(200);
      expect(list.body.data.map((o) => o.id)).toEqual([order.order_id]);
      const res = await patchStatus(m.token, order.order_id, { status: 'confirmed' }).expect(403);
      expect(res.body.message).toBe('This order includes stock from another branch — a super admin must handle it');
      await patchStatus(m.token, order.order_id, { status: 'cancelled' }).expect(403);
    }
    await api.get(`/api/v1/orders/${order.order_id}`).set(f.auth(mc.token)).expect(404);
    expect((await api.get('/api/v1/orders').set(f.auth(mc.token)).expect(200)).body.data).toHaveLength(0);
    await patchStatus(mc.token, order.order_id, { status: 'confirmed' }).expect(404);
    expect((await h.orderRow(order.order_id)).status).toBe('pending');

    await patchStatus(sa.token, order.order_id, { status: 'confirmed' }).expect(200);
    expect(await h.stock(va.id, a.id)).toMatchObject({ quantity: 4, reserved: 0 });
    expect(await h.stock(vb.id, b.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('reconcile of a mixed-branch online order needs a super admin', async () => {
    const a = await f.branch();
    const b = await f.branch();
    const va = await h.variantAt(a.id);
    const vb = await h.variantAt(b.id);
    const order = await h.placeOrder((await f.user()).token, va, {
      items: [{ variant_id: va.id, quantity: 1 }, { variant_id: vb.id, quantity: 1 }],
    });
    const ma = await f.user({ role: 'branch_admin', branch_id: a.id });
    const sa = await f.user({ role: 'super_admin' });
    const url = `/api/v1/payments/orders/${order.order_id}/reconcile`;
    await api.get(url).set(f.auth(ma.token)).expect(403);
    await api.get(url).set(f.auth(sa.token)).expect(200);
  });
});
