const { api, query, resetDb, factories: f } = require('../helpers');
const {
  world, coupon, expectStockInvariants, ledgerSum, expectStaffOnly, auditCount,
} = require('./ops.helpers');

const POS = '/api/v1/pos';
let w;
let laptop; // 50,000 — 3 at A, 2 at B
let mouse; // 1,000 — 10 at A

beforeEach(async () => {
  await resetDb();
  w = await world();
  ({ variants: [laptop] } = await f.product({
    name: 'Dell Latitude 7490',
    variants: [{
      sku: 'DL-7490-I7', price: 50000,
      stock: [{ branch_id: w.branchA.id, quantity: 3 }, { branch_id: w.branchB.id, quantity: 2 }],
    }],
  }));
  ({ variants: [mouse] } = await f.product({
    name: 'Logitech MX Master',
    variants: [{ sku: 'LG-MX3', price: 1000, stock: [{ branch_id: w.branchA.id, quantity: 10 }] }],
  }));
});

afterEach(expectStockInvariants);

const as = (who) => f.auth(who.token);
const sell = (who, body) => api.post(`${POS}/sales`).set(as(who)).send(body);
const line = (variant, quantity = 1, extra = {}) => ({ variant_id: variant.id, quantity, ...extra });

describe('authz', () => {
  test('anonymous → 401, customer → 403 on every POS route; void is super_admin only', async () => {
    const sale = await sell(w.adminA, { items: [line(mouse)] }).expect(201);
    const id = sale.body.data.id;
    await expectStaffOnly([
      ['post', `${POS}/sales`, { items: [line(mouse)] }],
      ['get', `${POS}/sales`],
      ['get', `${POS}/sales/${id}`],
      ['post', `${POS}/sales/${id}/void`, { reason: 'test' }],
      ['get', `${POS}/catalog?q=dell`],
    ], w.customer.token);
    await api.post(`${POS}/sales/${id}/void`).set(as(w.adminA)).send({ reason: 'mistake' }).expect(403);
  });

  test('branch_admin of A is blocked from branch B', async () => {
    const saleB = await sell(w.adminB, { items: [line(laptop)] }).expect(201);
    const t = as(w.adminA);
    await api.post(`${POS}/sales`).set(t).send({ branch_id: w.branchB.id, items: [line(laptop)] }).expect(403);
    await api.get(`${POS}/sales?branch_id=${w.branchB.id}`).set(t).expect(403);
    await api.get(`${POS}/sales/${saleB.body.data.id}`).set(t).expect(404);
    await api.get(`${POS}/catalog?q=dell&branch_id=${w.branchB.id}`).set(t).expect(403);
    const list = await api.get(`${POS}/sales`).set(t).expect(200);
    expect(list.body.data).toHaveLength(0);
    expect((await f.stock(laptop.id, w.branchB.id)).quantity).toBe(1);
  });
});

describe('POST /pos/sales', () => {
  test('server-priced sale: order, items, transaction, ledger, stock', async () => {
    const res = await sell(w.adminA, {
      items: [line(laptop, 2), line(mouse, 1)], payment_method: 'bkash', customer_name: 'Rahim',
    }).expect(201);
    const s = res.body.data;
    expect(s.order_number).toMatch(/^PG-\d{8}-\d{6}$/);
    expect(s).toMatchObject({
      channel: 'pos', status: 'delivered', branch_id: w.branchA.id, payment_method: 'bkash',
      payment_status: 'completed', subtotal: '101000.00', discount: '0.00', total_amount: '101000.00',
      operator_name: 'Alam Admin', customer_name: 'Rahim',
    });
    expect(s.transaction).toMatchObject({ payment_method: 'bkash', payment_status: 'completed', amount: '101000.00' });
    const item = s.items.find((i) => i.variant_id === laptop.id);
    expect(item).toMatchObject({ quantity: 2, unit_price: '50000.00', list_price: '50000.00', total_price: '100000.00', branch_id: w.branchA.id, sku: 'DL-7490-I7' });

    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(1);
    expect((await f.stock(mouse.id, w.branchA.id)).quantity).toBe(9);
    expect(await ledgerSum(laptop.id, w.branchA.id)).toBe(-2);
    expect(await auditCount('pos.sale', s.id)).toBe(1);
    expect(await auditCount('pos.price_override', s.id)).toBe(0);
  });

  test('uses the scheduled sale price (effectivePriceSql), not a client price', async () => {
    await query(
      `UPDATE product_variants SET sale_price = 45000, sale_starts_at = NOW() - INTERVAL '1 hour',
              sale_ends_at = NOW() + INTERVAL '1 day' WHERE id = $1`, [laptop.id]
    );
    const res = await sell(w.adminA, { items: [line(laptop)] }).expect(201);
    expect(res.body.data.items[0]).toMatchObject({ unit_price: '45000.00', list_price: '45000.00' });
    // unit_price without a reason is rejected rather than silently trusted.
    await sell(w.adminA, { items: [line(laptop, 1, { unit_price: 1 })] }).expect(400);
    await sell(w.adminA, { items: [line(laptop, 1, { price_override_reason: 'friend' })] }).expect(400);
  });

  test('BE-01: a unit reserved for a pending online order cannot be sold at the counter', async () => {
    const { variants: [last] } = await f.product({
      variants: [{ price: 30000, stock: [{ branch_id: w.branchA.id, quantity: 1, reserved: 1 }] }],
    });
    const res = await sell(w.adminA, { items: [line(last)] }).expect(409);
    expect(res.body.message).toMatch(/only 0 available/);
    expect(await f.stock(last.id, w.branchA.id)).toMatchObject({ quantity: 1, reserved: 1 });
    expect((await query("SELECT COUNT(*)::int AS n FROM orders WHERE channel = 'pos'")).rows[0].n).toBe(0);

    // With 2 on hand and 1 reserved, exactly one can be sold.
    await query('UPDATE inventory SET quantity = 2 WHERE variant_id = $1', [last.id]);
    await sell(w.adminA, { items: [line(last, 2)] }).expect(409);
    await sell(w.adminA, { items: [line(last, 1)] }).expect(201);
    expect(await f.stock(last.id, w.branchA.id)).toMatchObject({ quantity: 1, reserved: 1 });
  });

  test('two simultaneous sales of the last unit: exactly one succeeds', async () => {
    const { variants: [last] } = await f.product({
      variants: [{ price: 30000, stock: [{ branch_id: w.branchA.id, quantity: 1 }] }],
    });
    const [r1, r2] = await Promise.all([
      sell(w.adminA, { items: [line(last)] }),
      sell(w.sa, { branch_id: w.branchA.id, items: [line(last)] }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect((await f.stock(last.id, w.branchA.id)).quantity).toBe(0);
    expect((await query("SELECT COUNT(*)::int AS n FROM orders WHERE channel = 'pos'")).rows[0].n).toBe(1);
  });

  test('multi-line sales in opposite line order do not deadlock', async () => {
    const results = await Promise.all([
      sell(w.adminA, { items: [line(laptop), line(mouse)] }),
      sell(w.adminA, { items: [line(mouse), line(laptop)] }),
      sell(w.adminA, { items: [line(laptop), line(mouse)] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(0);
  });

  test('branch: operator branch; super_admin needs branch_id; inactive branch refused', async () => {
    await sell(w.sa, { items: [line(laptop)] }).expect(400);
    const res = await sell(w.sa, { branch_id: w.branchB.id, items: [line(laptop)] }).expect(201);
    expect(res.body.data.branch_id).toBe(w.branchB.id);
    expect((await f.stock(laptop.id, w.branchB.id)).quantity).toBe(1);
    await query('UPDATE branches SET is_active = FALSE WHERE id = $1', [w.branchB.id]);
    await sell(w.adminB, { items: [line(laptop)] }).expect(400);
  });

  test('validation: arrays, negatives, oversize, duplicates', async () => {
    const bad = [
      {},
      { items: [] },
      { items: 'laptop' },
      { items: [line(laptop, 0)] },
      { items: [line(laptop, -1)] },
      { items: [line(laptop, 1.5)] },
      { items: [line(laptop, '1')] },
      { items: [line(laptop, 1001)] },
      { items: Array.from({ length: 101 }, () => line(mouse)) },
      { items: [line(laptop), line(laptop)] },
      { items: [{ variant_id: 'nope', quantity: 1 }] },
      { items: [line(laptop, 1, { unit_price: -5, price_override_reason: 'discount' })] },
      { items: [line(laptop, 1, { unit_price: 0, price_override_reason: 'free' })] },
      { items: [line(laptop)], discount: -10 },
      { items: [line(laptop)], discount: '100' },
      { items: [line(laptop)], discount: 10.555 },
      { items: [line(laptop)], customer_phone: '12345' },
      { items: [line(laptop)], payment_method: 'crypto' },
      { items: [line(laptop)], customer_name: 'x'.repeat(121) },
      { items: [line(laptop, 1, { unit_ids: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] })] },
    ];
    for (const body of bad) {
      const res = await sell(w.adminA, body);
      expect([JSON.stringify(body).slice(0, 80), res.status]).toEqual([JSON.stringify(body).slice(0, 80), 400]);
    }
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(3);
  });

  test('unknown variant → 400 and nothing is sold', async () => {
    await sell(w.adminA, { items: [line(mouse), { variant_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }).expect(400);
    expect((await f.stock(mouse.id, w.branchA.id)).quantity).toBe(10);
  });
});

describe('price overrides and manual discounts', () => {
  test('branch_admin override is capped at 10% below list; audited', async () => {
    const ok = await sell(w.adminA, {
      items: [line(laptop, 1, { unit_price: 45000, price_override_reason: 'Scratched lid' })],
    }).expect(201);
    expect(ok.body.data.items[0]).toMatchObject({ unit_price: '45000.00', list_price: '50000.00' });
    expect(ok.body.data.total_amount).toBe('45000.00');
    const log = await query("SELECT data FROM admin_audit_log WHERE action = 'pos.price_override'");
    expect(log.rows[0].data.overrides[0]).toMatchObject({ list_price: 50000, unit_price: 45000, reason: 'Scratched lid' });

    const r = await sell(w.adminA, { items: [line(laptop, 1, { unit_price: 44999.99, price_override_reason: 'Friend' })] }).expect(403);
    expect(r.body.message).toMatch(/45,000/);
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(2);
  });

  test('super_admin override is unrestricted but must be > 0; mark-ups allowed', async () => {
    await sell(w.sa, { branch_id: w.branchA.id, items: [line(laptop, 1, { unit_price: 100, price_override_reason: 'Owner' })] }).expect(201);
    const up = await sell(w.adminA, { items: [line(mouse, 1, { unit_price: 1200, price_override_reason: 'Bundle' })] }).expect(201);
    expect(up.body.data.total_amount).toBe('1200.00');
  });

  test('manual discount: branch_admin ≤ 10% of subtotal, combined with overrides ≤ 10%; never above subtotal', async () => {
    await sell(w.adminA, { items: [line(laptop)], discount: 5000, discount_reason: 'Loyal' }).expect(201);
    await sell(w.adminA, { items: [line(laptop)], discount: 5000.01 }).expect(403);
    await sell(w.adminA, {
      items: [line(laptop, 1, { unit_price: 45000, price_override_reason: 'Scratch' })], discount: 1,
    }).expect(403);
    await sell(w.sa, { branch_id: w.branchA.id, items: [line(mouse)], discount: 900 }).expect(201);
    await sell(w.sa, { branch_id: w.branchA.id, items: [line(mouse)], discount: 1000.01 }).expect(400);
    expect(await auditCount('pos.price_override')).toBe(2);
  });

  test('the cap follows POS_MAX_STAFF_DISCOUNT_PCT', async () => {
    const old = process.env.POS_MAX_STAFF_DISCOUNT_PCT;
    process.env.POS_MAX_STAFF_DISCOUNT_PCT = '20';
    try {
      await sell(w.adminA, { items: [line(laptop, 1, { unit_price: 40000, price_override_reason: 'Demo unit' })] }).expect(201);
    } finally {
      if (old === undefined) delete process.env.POS_MAX_STAFF_DISCOUNT_PCT;
      else process.env.POS_MAX_STAFF_DISCOUNT_PCT = old;
    }
    await sell(w.adminA, { items: [line(laptop, 1, { unit_price: 40000, price_override_reason: 'Demo unit' })] }).expect(403);
  });
});

describe('coupons and customers', () => {
  test('POS coupon: redemption recorded, max_discount cap respected', async () => {
    const c = await coupon({ code: 'EID10', discount_value: 10, max_discount: 2000, channel: 'pos' });
    const res = await sell(w.adminA, { items: [line(laptop)], coupon_code: 'eid10' }).expect(201);
    expect(res.body.data).toMatchObject({ discount: '2000.00', total_amount: '48000.00', coupon_code: 'EID10' });
    const red = await query('SELECT discount, order_id FROM coupon_redemptions WHERE coupon_id = $1', [c.id]);
    expect(red.rows).toEqual([{ discount: '2000.00', order_id: res.body.data.id }]);
    expect((await query('SELECT used_count FROM coupons WHERE id = $1', [c.id])).rows[0].used_count).toBe(1);
  });

  test('online-only, exhausted or invalid coupons are refused and nothing is sold', async () => {
    await coupon({ code: 'WEBONLY', channel: 'online' });
    await coupon({ code: 'GONE', max_uses: 1 }).then((c) => query('UPDATE coupons SET used_count = 1 WHERE id = $1', [c.id]));
    for (const code of ['WEBONLY', 'GONE', 'NOPE']) {
      await sell(w.adminA, { items: [line(laptop)], coupon_code: code }).expect(400);
    }
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(3);
  });

  test('coupon + manual discount never exceed the subtotal', async () => {
    await coupon({ code: 'FLAT900', discount_type: 'fixed', discount_value: 900 });
    const res = await sell(w.sa, { branch_id: w.branchA.id, items: [line(mouse)], discount: 500, coupon_code: 'FLAT900' }).expect(201);
    expect(res.body.data).toMatchObject({ discount: '1000.00', total_amount: '0.00' });
    const red = await query('SELECT discount FROM coupon_redemptions');
    expect(red.rows[0].discount).toBe('500.00');
  });

  test('a matching customer phone links the order and enforces per-user limits', async () => {
    await coupon({ code: 'ONCE', per_user_limit: 1 });
    const phone = w.customer.user.phone;
    const res = await sell(w.adminA, {
      items: [line(mouse)], customer_phone: `+88${phone}`, customer_name: 'Karim', coupon_code: 'ONCE',
    }).expect(201);
    expect(res.body.data).toMatchObject({ customer_id: w.customer.user.id, customer_phone: phone });
    const red = await query('SELECT user_id FROM coupon_redemptions');
    expect(red.rows[0].user_id).toBe(w.customer.user.id);
    await sell(w.adminA, { items: [line(mouse)], customer_phone: phone, coupon_code: 'ONCE' }).expect(400);

    const unknown = await sell(w.adminA, { items: [line(mouse)], customer_phone: '01999888777' }).expect(201);
    expect(unknown.body.data.customer_id).toBeNull();
  });
});

describe('serial units at the counter', () => {
  const register = (serial, branchId = w.branchA.id) =>
    api.post('/api/v1/inventory/units').set(as(w.sa))
      .send({ variant_id: laptop.id, branch_id: branchId, serial_number: serial }).expect(201);

  test('sold units are marked sold and linked to the order line', async () => {
    const u = (await register('SN-POS-1')).body.data; // A: 4 on hand
    const res = await sell(w.adminA, { items: [line(laptop, 2, { unit_ids: [u.id] })] }).expect(201);
    const unit = (await query('SELECT status, order_item_id, sold_at FROM inventory_units WHERE id = $1', [u.id])).rows[0];
    expect(unit.status).toBe('sold');
    expect(unit.order_item_id).toBe(res.body.data.items[0].id);
    expect(unit.sold_at).not.toBeNull();
    expect(res.body.data.items[0].units.map((x) => x.serial_number)).toEqual(['SN-POS-1']);
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(2);

    // Already sold, or held at another branch → 409.
    await sell(w.adminA, { items: [line(laptop, 1, { unit_ids: [u.id] })] }).expect(409);
    const b = (await register('SN-POS-B', w.branchB.id)).body.data;
    await sell(w.adminA, { items: [line(laptop, 1, { unit_ids: [b.id] })] }).expect(409);
    // A unit of another variant can't ride on this line.
    await sell(w.adminA, { items: [line(mouse, 1, { unit_ids: [b.id] })] }).expect(409);
  });
});

describe('GET /pos/sales', () => {
  test('branch scoped list with a day-close summary that excludes voided sales', async () => {
    await sell(w.adminA, { items: [line(laptop)], discount: 1000, payment_method: 'cash' }).expect(201);
    const s2 = await sell(w.adminA, { items: [line(mouse, 2)], payment_method: 'card', customer_phone: '01811222333' }).expect(201);
    const s3 = await sell(w.adminA, { items: [line(mouse)], payment_method: 'cash' }).expect(201);
    await sell(w.adminB, { items: [line(laptop)] }).expect(201);
    await api.post(`${POS}/sales/${s3.body.data.id}/void`).set(as(w.sa)).send({ reason: 'Customer changed mind' }).expect(200);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    const res = await api.get(`${POS}/sales?from=${today}&to=${today}`).set(as(w.adminA)).expect(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.summary).toMatchObject({
      count: 2, gross: 52000, discount: 1000, net: 51000, voided_count: 1, voided_net: 1000,
      by_payment_method: { cash: { count: 1, net: 49000 }, card: { count: 1, net: 2000 } },
    });
    expect(res.body.data[0]).toHaveProperty('operator_name', 'Alam Admin');

    const t = as(w.sa);
    expect((await api.get(`${POS}/sales`).set(t)).body.pagination.total).toBe(4);
    expect((await api.get(`${POS}/sales?branch_id=${w.branchB.id}`).set(t)).body.pagination.total).toBe(1);
    expect((await api.get(`${POS}/sales?payment_method=card`).set(t)).body.data.map((s) => s.id)).toEqual([s2.body.data.id]);
    expect((await api.get(`${POS}/sales?q=01811222`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${POS}/sales?q=${s2.body.data.order_number}`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${POS}/sales?operator_id=${w.adminB.user.id}`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${POS}/sales?voided=true`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${POS}/sales?to=2001-01-01`).set(t)).body.summary.count).toBe(0);

    await api.get(`${POS}/sales?payment_method=cash&payment_method=card`).set(t).expect(400);
    await api.get(`${POS}/sales?from=nope`).set(t).expect(400);
    await api.get(`${POS}/sales?operator_id=1 OR 1=1`).set(t).expect(400);
  });

  test('GET /pos/sales/:id: online orders are not POS sales', async () => {
    const { rows: [online] } = await query(
      `INSERT INTO orders (order_number, user_id, channel, status, subtotal, total_amount)
       VALUES ('PG-TEST-1', $1, 'online', 'pending', 100, 100) RETURNING id`, [w.customer.user.id]
    );
    await api.get(`${POS}/sales/${online.id}`).set(as(w.sa)).expect(404);
    await api.post(`${POS}/sales/${online.id}/void`).set(as(w.sa)).send({ reason: 'nope' }).expect(404);
  });
});

describe('POST /pos/sales/:id/void', () => {
  test('restocks, restores units, releases the coupon, refunds; second void → 409', async () => {
    const c = await coupon({ code: 'VOIDME', discount_value: 5 });
    const unit = (await api.post('/api/v1/inventory/units').set(as(w.adminA))
      .send({ variant_id: laptop.id, serial_number: 'SN-V1' })).body.data; // A: 4
    const sale = (await sell(w.adminA, {
      items: [line(laptop, 2, { unit_ids: [unit.id] }), line(mouse, 3)], coupon_code: 'VOIDME',
    }).expect(201)).body.data;
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(2);

    const res = await api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: 'Wrong items rung up' }).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'cancelled', payment_status: 'refunded', void_reason: 'Wrong items rung up', voided_by_name: 'Super Admin',
    });
    expect(res.body.data.transaction.payment_status).toBe('refunded');
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(4);
    expect((await f.stock(mouse.id, w.branchA.id)).quantity).toBe(10);
    expect((await query('SELECT status, order_item_id FROM inventory_units WHERE id = $1', [unit.id])).rows[0])
      .toEqual({ status: 'in_stock', order_item_id: null });
    expect((await query('SELECT used_count FROM coupons WHERE id = $1', [c.id])).rows[0].used_count).toBe(0);
    expect((await query('SELECT released_at FROM coupon_redemptions')).rows[0].released_at).not.toBeNull();
    expect(await ledgerSum(laptop.id, w.branchA.id)).toBe(1); // +1 registered, -2 sold, +2 returned
    expect(await auditCount('pos.void', sale.id)).toBe(1);
    // Same lifecycle bookkeeping as online orders (timestamps + status history).
    const o = (await query('SELECT delivered_at, cancelled_at, cancel_reason FROM orders WHERE id = $1', [sale.id])).rows[0];
    expect(o.delivered_at).not.toBeNull();
    expect(o.cancelled_at).not.toBeNull();
    expect(o.cancel_reason).toBe('staff');
    const hist = await query('SELECT from_status, to_status FROM order_status_history WHERE order_id = $1 ORDER BY created_at', [sale.id]);
    expect(hist.rows).toEqual([{ from_status: null, to_status: 'delivered' }, { from_status: 'delivered', to_status: 'cancelled' }]);

    await api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: 'again' }).expect(409);
    expect((await f.stock(laptop.id, w.branchA.id)).quantity).toBe(4);
  });

  test('concurrent voids: exactly one succeeds; reason required', async () => {
    const sale = (await sell(w.adminA, { items: [line(mouse, 2)] }).expect(201)).body.data;
    await api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({}).expect(400);
    await api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: ['a', 'b'] }).expect(400);
    const [r1, r2] = await Promise.all([
      api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: 'dup 1' }),
      api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: 'dup 2' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await f.stock(mouse.id, w.branchA.id)).quantity).toBe(10);
  });

  test('a sold unit that was since returned blocks the void (no double restock)', async () => {
    const unit = (await api.post('/api/v1/inventory/units').set(as(w.adminA))
      .send({ variant_id: laptop.id, serial_number: 'SN-RET' })).body.data;
    const sale = (await sell(w.adminA, { items: [line(laptop, 1, { unit_ids: [unit.id] })] }).expect(201)).body.data;
    await api.patch(`/api/v1/inventory/units/${unit.id}`).set(as(w.adminA)).send({ status: 'returned' }).expect(200);
    await api.post(`${POS}/sales/${sale.id}/void`).set(as(w.sa)).send({ reason: 'refund' }).expect(409);
  });
});

describe('GET /pos/catalog', () => {
  test('exact SKU first, then name matches; availability at the operator branch', async () => {
    const { variants: [dock] } = await f.product({
      name: 'Dell WD19 Dock',
      variants: [{ sku: 'DL', price: 15000, stock: [{ branch_id: w.branchA.id, quantity: 4, reserved: 3 }] }],
    });
    const res = await api.get(`${POS}/catalog?q=DL`).set(as(w.adminA)).expect(200);
    expect(res.body.data[0]).toMatchObject({
      variant_id: dock.id, exact_sku: true, available: 1, reserved: 3, effective_price: '15000.00', list_price: '15000.00',
      min_staff_price: 13500,
    });
    expect(res.body.data.map((r) => r.variant_id)).toContain(laptop.id);

    const byName = await api.get(`${POS}/catalog?q=latitude`).set(as(w.adminB)).expect(200);
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0]).toMatchObject({ variant_id: laptop.id, available: 2 });
  });

  test('a scanned serial number finds its variant; super_admin needs a branch; q required', async () => {
    const unit = (await api.post('/api/v1/inventory/units').set(as(w.adminA))
      .send({ variant_id: laptop.id, serial_number: 'CN0X1234' })).body.data;
    const res = await api.get(`${POS}/catalog?q=cn0x1234`).set(as(w.adminA)).expect(200);
    expect(res.body.data[0]).toMatchObject({ variant_id: laptop.id, matched_unit_id: unit.id });

    await api.get(`${POS}/catalog?q=dell`).set(as(w.sa)).expect(400);
    const sa = await api.get(`${POS}/catalog?q=dell&branch_id=${w.branchA.id}`).set(as(w.sa)).expect(200);
    expect(sa.body.data[0]).not.toHaveProperty('min_staff_price');
    await api.get(`${POS}/catalog`).set(as(w.adminA)).expect(400);
    await api.get(`${POS}/catalog?q=a&q=b`).set(as(w.adminA)).expect(400);
    expect((await api.get(`${POS}/catalog?q=%25`).set(as(w.adminA))).body.data).toHaveLength(0);
  });
});
