jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { api, query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const orderEvents = require('../../src/events/orderEvents');

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
const ALLOWED = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};
// How to reach each status from a fresh pending order.
const PATH = {
  pending: [],
  confirmed: ['confirmed'],
  processing: ['confirmed', 'processing'],
  shipped: ['confirmed', 'processing', 'shipped'],
  delivered: ['confirmed', 'processing', 'shipped', 'delivered'],
  cancelled: ['cancelled'],
  returned: ['confirmed', 'processing', 'shipped', 'delivered', 'returned'],
};

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
beforeEach(h.reset);
afterEach(() => orderEvents.removeAllListeners());

let ctx;
beforeEach(async () => {
  const s = await h.staff();
  const { variant } = await h.shop({ branch: s.branch, price: 10000, quantity: 5 });
  ctx = { ...s, variant };
});

const patchStatus = (token, id, body) => api.patch(`/api/v1/orders/${id}/status`).set(f.auth(token)).send(body);

/** A fresh COD (default) or card order, by a fresh customer. */
const newOrder = async ({ cod = true, variant = ctx.variant, ...overrides } = {}) => {
  const c = await f.user();
  const data = await h.placeOrder(c.token, variant, { payment_method: cod ? 'cod' : 'card', ...overrides });
  return { ...data, customer: c };
};

const walk = async (order, steps, token = ctx.manager.token) => {
  for (const status of steps) {
    const body = { status };
    if (status === 'shipped') Object.assign(body, { tracking_number: 'STF-123456', courier: 'Steadfast' });
    await patchStatus(token, order.order_id, body).expect(200);
  }
};

const inv = () => h.stock(ctx.variant.id, ctx.branch.id);

describe('transition matrix (COD order)', () => {
  test.each(STATUSES)('from %s: only the allowed targets succeed', async (from) => {
    // One order for every forbidden target (a 409 must not change it)...
    const order = await newOrder();
    await walk(order, PATH[from]);
    const before = await h.orderRow(order.order_id);
    const stockBefore = await inv();
    for (const to of STATUSES.filter((s) => !ALLOWED[from].includes(s))) {
      const res = await patchStatus(ctx.admin.token, order.order_id, { status: to });
      expect([to, res.status]).toEqual([to, 409]);
    }
    expect((await h.orderRow(order.order_id)).status).toBe(before.status);
    expect(await inv()).toEqual(stockBefore);

    // ...and a fresh order per allowed target.
    for (const to of ALLOWED[from]) {
      const o = await newOrder();
      await walk(o, PATH[from]);
      await walk(o, [to]);
      expect((await h.orderRow(o.order_id)).status).toBe(to);
    }
  });
});

describe('COD lifecycle with stock checks', () => {
  test('pending → confirmed → processing → shipped → delivered → returned', async () => {
    const events = [];
    orderEvents.on(orderEvents.STATUS_CHANGED, (e) => events.push({ from: e.from, to: e.to, actor: e.actor }));
    const order = await newOrder();
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 1 });

    await patchStatus(ctx.manager.token, order.order_id, { status: 'confirmed', note: 'Called customer' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'pending' });

    await patchStatus(ctx.manager.token, order.order_id, { status: 'processing' }).expect(200);
    const shipped = await patchStatus(ctx.manager.token, order.order_id, {
      status: 'shipped', tracking_number: 'STF-123456', courier: 'Steadfast',
    }).expect(200);
    expect(shipped.body.data).toMatchObject({ status: 'shipped', tracking_number: 'STF-123456', courier: 'Steadfast' });
    expect(shipped.body.data.shipped_at).toBeTruthy();
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });

    const delivered = await patchStatus(ctx.manager.token, order.order_id, { status: 'delivered' }).expect(200);
    expect(delivered.body.data).toMatchObject({ status: 'delivered', payment_status: 'completed' });
    expect(delivered.body.data.delivered_at).toBeTruthy();
    expect(delivered.body.data.transactions).toEqual([
      expect.objectContaining({ payment_method: 'cash', payment_status: 'completed', amount: '10100.00', recorded_by: ctx.manager.user.id }),
    ]);

    await patchStatus(ctx.manager.token, order.order_id, { status: 'returned', note: 'Faulty keyboard' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 0 });
    const row = await h.orderRow(order.order_id);
    expect(row.system_note).toMatch(/refund required/);

    const hist = delivered.body.data.status_history.map((x) => x.to_status);
    expect(hist).toEqual(['pending', 'confirmed', 'processing', 'shipped', 'delivered']);
    expect(delivered.body.data.status_history[1]).toMatchObject({ note: 'Called customer', actor_name: ctx.manager.user.full_name });

    expect(events.map((e) => e.to)).toEqual(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned']);
    expect(events[1]).toMatchObject({ from: 'pending', actor: { id: ctx.manager.user.id, role: 'branch_admin' } });

    const ledger = (await query(`SELECT movement_type, quantity_delta FROM stock_movements WHERE reference_id = $1 ORDER BY created_at`, [order.order_id])).rows;
    expect(ledger.map((l) => `${l.movement_type}${l.quantity_delta}`)).toEqual(['reservation-1', 'sale-1', 'return1']);

    const audits = (await query(`SELECT action FROM admin_audit_log WHERE entity_id = $1`, [order.order_id])).rows;
    expect(audits.filter((a) => a.action === 'order.status')).toHaveLength(5);
  });

  test('return without restock leaves stock as sold', async () => {
    const order = await newOrder();
    await walk(order, PATH.delivered);
    await patchStatus(ctx.manager.token, order.order_id, { status: 'returned', restock: false }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('shipped → returned (refused at the door) restocks; COD payment cancelled', async () => {
    const order = await newOrder();
    await walk(order, PATH.shipped);
    await patchStatus(ctx.manager.token, order.order_id, { status: 'returned' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 0 });
    expect(await h.orderRow(order.order_id)).toMatchObject({ payment_status: 'cancelled' });
  });

  test('cancel while pending releases the reservation and the coupon', async () => {
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until, max_uses)
                 VALUES ('ONCE', 'fixed', 500, NOW() - interval '1 day', NOW() + interval '1 day', 1)`);
    const order = await newOrder({ coupon_code: 'ONCE' });
    expect((await query(`SELECT used_count FROM coupons`)).rows[0].used_count).toBe(1);
    await patchStatus(ctx.manager.token, order.order_id, { status: 'cancelled', note: 'Customer changed mind' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 0 });
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'cancelled', cancel_reason: 'staff' });
    expect((await query(`SELECT used_count FROM coupons`)).rows[0].used_count).toBe(0);
    // the freed use is available again
    await newOrder({ coupon_code: 'ONCE' });
  });

  test.each(['confirmed', 'processing'])('cancel after %s restocks and releases the coupon', async (from) => {
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('C1', 'fixed', 500, NOW() - interval '1 day', NOW() + interval '1 day')`);
    const order = await newOrder({ coupon_code: 'C1' });
    await walk(order, PATH[from]);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });
    await patchStatus(ctx.manager.token, order.order_id, { status: 'cancelled' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 0 });
    expect((await query(`SELECT used_count FROM coupons`)).rows[0].used_count).toBe(0);
  });

  test('two staff confirming at once: stock is committed exactly once', async () => {
    const order = await newOrder();
    const results = await Promise.all([
      patchStatus(ctx.manager.token, order.order_id, { status: 'confirmed' }),
      patchStatus(ctx.admin.token, order.order_id, { status: 'confirmed' }),
      patchStatus(ctx.admin.token, order.order_id, { status: 'confirmed' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('two staff cancelling at once: the reservation is released exactly once', async () => {
    await newOrder(); // another reservation that must survive
    const order = await newOrder();
    const results = await Promise.all([
      patchStatus(ctx.manager.token, order.order_id, { status: 'cancelled' }),
      patchStatus(ctx.admin.token, order.order_id, { status: 'cancelled' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 1 });
  });
});

describe('online orders', () => {
  test('unpaid online order cannot be confirmed by staff', async () => {
    const order = await newOrder({ cod: false });
    const res = await patchStatus(ctx.admin.token, order.order_id, { status: 'confirmed' }).expect(409);
    expect(res.body.message).toMatch(/not been paid/);
  });

  test('mark_paid: owner only, needs a note and a method; records a manual transaction', async () => {
    const order = await newOrder({ cod: false });
    await patchStatus(ctx.manager.token, order.order_id, { status: 'confirmed', mark_paid: true, note: 'bKash 01711' }).expect(403);
    await patchStatus(ctx.admin.token, order.order_id, { status: 'confirmed', mark_paid: true }).expect(400);
    await patchStatus(ctx.admin.token, order.order_id, { status: 'confirmed', mark_paid: true, note: 'bKash TrxID 9XYZ' }).expect(400);
    await patchStatus(ctx.admin.token, order.order_id, { status: 'cancelled', mark_paid: true, note: 'x' }).expect(400);
    const res = await patchStatus(ctx.admin.token, order.order_id, {
      status: 'confirmed', mark_paid: true, note: 'bKash TrxID 9XYZ', payment_method: 'bkash',
    }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    expect(res.body.data.transactions).toEqual([expect.objectContaining({
      payment_method: 'bkash', payment_status: 'completed', note: 'bKash TrxID 9XYZ', recorded_by: ctx.admin.user.id, ssl_validation_id: null,
    })]);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });

    // A gateway payment arriving later for the same order is a duplicate, flagged for refund.
    const p = gw.pay(order);
    const cb = await h.success({ val_id: p.val_id }).expect(303);
    expect(cb.headers.location).toContain('/order-success');
    const txs = await h.txRows(order.order_id);
    expect(txs.map((t) => t.payment_status).sort()).toEqual(['completed', 'processing']);
    expect((await h.orderRow(order.order_id)).system_note).toMatch(/Duplicate payment .* refund required/);
  });

  test('cancelling a paid online order restocks and flags the refund; owner records it', async () => {
    const order = await newOrder({ cod: false });
    const p = gw.pay(order);
    await h.success({ val_id: p.val_id }).expect(303);
    expect(await inv()).toMatchObject({ quantity: 4, reserved: 0 });

    // refund not allowed while the order is active
    await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.admin.token))
      .send({ payment_status: 'refunded', note: 'Refund via panel' }).expect(409);

    await patchStatus(ctx.manager.token, order.order_id, { status: 'cancelled' }).expect(200);
    expect(await inv()).toMatchObject({ quantity: 5, reserved: 0 });
    const row = await h.orderRow(order.order_id);
    expect(row).toMatchObject({ status: 'cancelled', payment_status: 'completed' });
    expect(row.system_note).toMatch(/refund required/);

    await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.manager.token))
      .send({ payment_status: 'refunded', note: 'Refund via panel' }).expect(403);
    await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.admin.token))
      .send({ payment_status: 'completed', note: 'x' }).expect(400);
    const res = await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.admin.token))
      .send({ payment_status: 'refunded', note: 'Refunded in SSLCommerz panel' }).expect(200);
    expect(res.body.data.payment_status).toBe('refunded');
    expect(res.body.data.transactions[0].payment_status).toBe('refunded');
    // twice → 409
    await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.admin.token))
      .send({ payment_status: 'refunded', note: 'again' }).expect(409);
    // a replayed callback for the refunded payment is never "success"
    const again = await h.success({ val_id: p.val_id }).expect(303);
    expect(again.headers.location).toContain('payment=failed');
  });

  test('refund of an unpaid cancelled order → 409', async () => {
    const order = await newOrder({ cod: false });
    await patchStatus(ctx.manager.token, order.order_id, { status: 'cancelled' }).expect(200);
    await api.patch(`/api/v1/orders/${order.order_id}/payment`).set(f.auth(ctx.admin.token))
      .send({ payment_status: 'refunded', note: 'nothing to refund' }).expect(409);
  });
});

describe('status endpoint rules', () => {
  test('POS orders cannot be changed here', async () => {
    const { rows: [pos] } = await query(
      `INSERT INTO orders (order_number, branch_id, channel, status, subtotal, total_amount, payment_method, payment_status)
       VALUES ('PG-20261003-900001', $1, 'pos', 'delivered', 100, 100, 'cash', 'completed') RETURNING id`,
      [ctx.branch.id]
    );
    await patchStatus(ctx.admin.token, pos.id, { status: 'returned' }).expect(409);
  });

  test.each([
    [{ status: 'teleported' }],
    [{ status: ['confirmed'] }],
    [{}],
    [{ status: 'confirmed', note: 'x'.repeat(501) }],
    [{ status: 'confirmed', tracking_number: 'ABC' }],
    [{ status: 'shipped', tracking_number: '<script>' }],
    [{ status: 'confirmed', restock: true }],
    [{ status: 'confirmed', mark_paid: 'yes', note: 'x' }],
  ])('invalid body %j → 400', async (body) => {
    const order = await newOrder();
    await patchStatus(ctx.admin.token, order.order_id, body).expect(400);
  });

  test('missing order → 404, bad id → 400', async () => {
    await patchStatus(ctx.admin.token, '00000000-0000-4000-8000-000000000000', { status: 'confirmed' }).expect(404);
    await patchStatus(ctx.admin.token, 'abc', { status: 'confirmed' }).expect(400);
  });

  test('orders are never deleted', async () => {
    const order = await newOrder();
    await api.delete(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.admin.token)).expect(404);
    await api.put(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.admin.token)).send({ status: 'delivered' }).expect(404);
    expect(await h.orderRow(order.order_id)).toBeTruthy();
  });
});

describe('authz and branch scoping', () => {
  test('staff routes: anonymous 401, customer 403', async () => {
    const order = await newOrder();
    const id = order.order_id;
    const calls = [
      () => api.get('/api/v1/orders'),
      () => api.get(`/api/v1/orders/${id}`),
      () => api.patch(`/api/v1/orders/${id}/status`).send({ status: 'confirmed' }),
      () => api.patch(`/api/v1/orders/${id}`).send({ admin_note: 'x' }),
      () => api.patch(`/api/v1/orders/${id}/payment`).send({ payment_status: 'refunded', note: 'xyz' }),
    ];
    for (const call of calls) {
      await call().expect(401);
      await call().set(f.auth(order.customer.token)).expect(403);
    }
  });

  test('branch_admin of another branch cannot see or change the order', async () => {
    const order = await newOrder();
    const t = ctx.outsider.token;
    await api.get(`/api/v1/orders/${order.order_id}`).set(f.auth(t)).expect(404);
    await patchStatus(t, order.order_id, { status: 'confirmed' }).expect(404);
    await api.patch(`/api/v1/orders/${order.order_id}`).set(f.auth(t)).send({ admin_note: 'x' }).expect(404);
    const list = await api.get(`/api/v1/orders?branch_id=${ctx.branch.id}`).set(f.auth(t)).expect(200);
    expect(list.body.data).toHaveLength(0);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', admin_note: null });

    // a branch_admin with no branch sees nothing
    const floating = await f.user({ role: 'branch_admin' });
    expect((await api.get('/api/v1/orders').set(f.auth(floating.token)).expect(200)).body.data).toHaveLength(0);
    await api.get(`/api/v1/orders/${order.order_id}`).set(f.auth(floating.token)).expect(404);
  });

  test('admin note: staff of the branch can set it; nothing else changes; audited', async () => {
    const order = await newOrder();
    const res = await api.patch(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.manager.token))
      .send({ admin_note: 'Fragile', status: 'delivered', total_amount: 1 }).expect(200);
    expect(res.body.data).toMatchObject({ admin_note: 'Fragile', status: 'pending', total_amount: '10100.00' });
    await api.patch(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.manager.token)).send({ admin_note: 5 }).expect(400);
    await api.patch(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.manager.token)).send({}).expect(400);
    const audits = (await query(`SELECT * FROM admin_audit_log WHERE action = 'order.note'`)).rows;
    expect(audits).toHaveLength(1);
  });
});

describe('GET /orders (staff list)', () => {
  test('filters, search, pagination and scoping', async () => {
    const otherShop = await h.shop({ branch: ctx.other, price: 30000 });
    const a = await newOrder();
    const b = await newOrder({ cod: false });
    const c = await newOrder({ variant: otherShop.variant, shipping_address: { ...h.ADDRESS, full_name: 'Karim 100%_Real', phone: '01811222333' } });
    await walk(a, ['confirmed']);

    const admin = ctx.admin.token;
    const all = await api.get('/api/v1/orders').set(f.auth(admin)).expect(200);
    expect(all.body.pagination).toMatchObject({ total: 3, page: 1 });
    expect(all.body.data[0]).toMatchObject({ item_count: 1, branch_name: expect.any(String) });
    expect(all.body.data[0].customer_name).toBeTruthy();
    expect(all.body.data.map((o) => o.order_number)).toEqual([c.order_number, b.order_number, a.order_number]);

    const ids = (res) => res.body.data.map((o) => o.id).sort();
    const get = (qs, token = admin) => api.get(`/api/v1/orders?${qs}`).set(f.auth(token)).expect(200);
    expect(ids(await get('status=confirmed'))).toEqual([a.order_id]);
    expect(ids(await get('payment_method=card'))).toEqual([b.order_id]);
    expect(ids(await get('payment_status=pending'))).toHaveLength(3);
    expect(ids(await get(`branch_id=${ctx.other.id}`))).toEqual([c.order_id]);
    expect(ids(await get(`q=${encodeURIComponent(a.order_number)}`))).toEqual([a.order_id]);
    expect(ids(await get('q=01811222333'))).toEqual([c.order_id]);
    expect(ids(await get('q=karim'))).toEqual([c.order_id]);
    expect(ids(await get('q=%25_'))).toEqual([c.order_id]); // literal "%_", not wildcards
    expect(ids(await get('q=%25'))).toEqual([c.order_id]);
    expect(ids(await get('channel=pos'))).toEqual([]);
    const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Asia/Dhaka date
    expect(ids(await get(`from=${today}&to=${today}`))).toHaveLength(3);
    expect(ids(await get('to=2000-01-01'))).toEqual([]);
    expect(ids(await get('sort=total_desc&limit=1'))).toEqual([c.order_id]);
    const page2 = await get('limit=2&page=2');
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination).toMatchObject({ total: 3, totalPages: 2, hasPrev: true, hasNext: false });

    // branch_admin: only their branch, even when asking for another
    expect(ids(await get('', ctx.manager.token))).toEqual([a.order_id, b.order_id].sort());
    expect(ids(await get(`branch_id=${ctx.other.id}`, ctx.manager.token))).toEqual([a.order_id, b.order_id].sort());
  });

  test.each([
    ['status=a&status=b'],
    ['status=lost'],
    ['page=0'],
    ['limit=101'],
    ['from=2026-13-01'],
    ['from=2026-10-05&to=2026-10-01'],
    ['branch_id=abc'],
    ['sort=created_at;drop'],
    ['q=' + 'x'.repeat(101)],
  ])('bad query %s → 400', async (qs) => {
    await api.get(`/api/v1/orders?${qs}`).set(f.auth(ctx.admin.token)).expect(400);
  });
});

describe('GET /orders/:id (staff detail)', () => {
  test('items, transactions without raw payload, history, address, coupon, customer', async () => {
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('WELCOME', 'fixed', 100, NOW() - interval '1 day', NOW() + interval '1 day')`);
    const order = await newOrder({ cod: false, coupon_code: 'welcome' });
    const p = gw.pay(order);
    await h.success({ val_id: p.val_id }).expect(303);

    const res = await api.get(`/api/v1/orders/${order.order_id}`).set(f.auth(ctx.manager.token)).expect(200);
    const d = res.body.data;
    expect(d).toMatchObject({
      id: order.order_id, status: 'confirmed', coupon_code: 'WELCOME', discount: '100.00',
      shipping_address: expect.objectContaining({ full_name: 'Rahim Uddin', division: 'Chattogram' }),
      customer: { id: order.customer.user.id, full_name: order.customer.user.full_name, phone: order.customer.user.phone, email: null },
    });
    expect(d.items).toEqual([expect.objectContaining({ sku: ctx.variant.sku, quantity: 1, list_price: '10000.00', branch_id: ctx.branch.id })]);
    expect(d.transactions).toEqual([expect.objectContaining({ ssl_validation_id: p.val_id, payment_status: 'completed' })]);
    expect(d.transactions[0].ssl_raw_response).toBeUndefined();
    expect(d.transactions[0].ssl_session_key).toBeUndefined();
    expect(d.status_history.map((x) => x.to_status)).toEqual(['pending', 'confirmed']);
    expect(JSON.stringify(d)).not.toMatch(/password_hash|token_version|store_passwd/);
  });
});

describe('customer views', () => {
  test('/orders/mine: own orders only, newest first, new fields, no staff notes', async () => {
    const c = await f.user();
    const first = await h.placeOrder(c.token, ctx.variant, { payment_method: 'cod' });
    const second = await h.placeOrder(c.token, ctx.variant);
    await newOrder(); // someone else's
    await api.patch(`/api/v1/orders/${first.order_id}`).set(f.auth(ctx.admin.token)).send({ admin_note: 'secret' }).expect(200);
    await walk(first, ['confirmed', 'processing', 'shipped']);

    const res = await api.get('/api/v1/orders/mine').set(f.auth(c.token)).expect(200);
    expect(res.body.data.map((o) => o.order_number)).toEqual([second.order_number, first.order_number]);
    const o = res.body.data[1];
    expect(o).toMatchObject({
      id: first.order_id, status: 'shipped', payment_method: 'cod', payment_status: 'pending',
      shipping_method: 'inside_chattogram', tracking_number: 'STF-123456', courier: 'Steadfast', total_amount: '10100.00',
      shipping_address: expect.objectContaining({ street: h.ADDRESS.street }),
    });
    expect(o.items).toEqual([expect.objectContaining({ sku: ctx.variant.sku, quantity: 1 })]);
    expect(o.status_history.map((x) => x.to_status)).toEqual(['pending', 'confirmed', 'processing', 'shipped']);
    expect(Object.keys(o.status_history[0]).sort()).toEqual(['created_at', 'to_status']);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|admin_note|system_note|actor/);

    await api.get('/api/v1/orders/mine').expect(401);
  });

  test('/orders/mine is capped at 100', async () => {
    const c = await f.user();
    await query(
      `INSERT INTO orders (order_number, user_id, channel, status, subtotal, total_amount, created_at)
       SELECT 'PG-20250101-' || lpad(g::text, 6, '0'), $1, 'online', 'delivered', 100, 100, NOW() - g * interval '1 minute'
         FROM generate_series(1, 105) g`,
      [c.user.id]
    );
    const res = await api.get('/api/v1/orders/mine').set(f.auth(c.token)).expect(200);
    expect(res.body.data).toHaveLength(100);
    expect(res.body.data[0].order_number).toBe('PG-20250101-000001');
  });

  test('/orders/mine/:orderNumber: owner only (IDOR → 404), bad number → 400', async () => {
    const order = await newOrder();
    const res = await api.get(`/api/v1/orders/mine/${order.order_number}`).set(f.auth(order.customer.token)).expect(200);
    expect(res.body.data).toMatchObject({ order_number: order.order_number, payment_method: 'cod', status_history: [expect.objectContaining({ to_status: 'pending' })] });
    expect(res.body.data.customer_note).toMatch(/^Ship to:/);
    expect(res.body.data.admin_note).toBeUndefined();
    expect(res.body.data.system_note).toBeUndefined();

    const other = await f.user();
    await api.get(`/api/v1/orders/mine/${order.order_number}`).set(f.auth(other.token)).expect(404);
    await api.get(`/api/v1/orders/mine/${encodeURIComponent("x' OR 1=1--")}`).set(f.auth(other.token)).expect(400);
  });
});
