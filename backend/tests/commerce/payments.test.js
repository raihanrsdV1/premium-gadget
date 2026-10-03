jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { api, query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const orderEvents = require('../../src/events/orderEvents');
const expiry = require('../../src/jobs/reservationExpiry');

const STORE = 'http://localhost:3000';

beforeEach(h.reset);
afterEach(() => orderEvents.removeAllListeners());

/** A customer with one pending online order for a ৳50,000 laptop (+৳100 shipping). */
const setup = async (opts = {}) => {
  const s = await h.shop(opts);
  const c = await f.user();
  const order = await h.placeOrder(c.token, s.variant, opts.checkout);
  return { ...s, ...c, order };
};

const historyOf = async (orderId) =>
  (await query('SELECT from_status, to_status, note FROM order_status_history WHERE order_id = $1 ORDER BY created_at', [orderId])).rows;

describe('happy path', () => {
  test('checkout → gateway → success confirms, commits stock, records one transaction', async () => {
    const { order, variant, branch } = await setup();
    expect(order.redirect_url).toMatch(/^https:\/\/sandbox\.sslcommerz\.com\//);
    expect(order.payment_method).toBe('card');
    expect(gw.client.createSession).toHaveBeenCalledTimes(1);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 1 });

    const events = [];
    orderEvents.on(orderEvents.STATUS_CHANGED, (e) => events.push(e));

    const p = gw.pay(order);
    const res = await h.success({ val_id: p.val_id, tran_id: order.order_number, value_a: order.order_id, status: 'VALID' }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/order-success?ref=${order.order_number}`);

    const row = await h.orderRow(order.order_id);
    expect(row).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    expect(row.confirmed_at).toBeTruthy();
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });

    const txs = await h.txRows(order.order_id);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ payment_status: 'completed', ssl_validation_id: p.val_id, ssl_status: 'VALID', payment_method: 'bkash' });
    expect(Number(txs[0].amount)).toBe(order.total);

    expect((await historyOf(order.order_id)).map((x) => x.to_status)).toEqual(['pending', 'confirmed']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: 'pending', to: 'confirmed', actor: null });
    expect(events[0].order.id).toBe(order.order_id);
  });

  test('the browser re-posting success (gateway now says VALIDATED) is idempotent', async () => {
    const { order } = await setup();
    const p = gw.pay(order);
    await h.success({ val_id: p.val_id }).expect(303);
    const again = await h.success({ val_id: p.val_id }).expect(303);
    expect(again.headers.location).toBe(`${STORE}/order-success?ref=${order.order_number}`);
    expect(await h.txRows(order.order_id)).toHaveLength(1);
  });

  test('a throwing / rejecting event listener never breaks the callback', async () => {
    const { order } = await setup();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    orderEvents.on(orderEvents.STATUS_CHANGED, () => { throw new Error('courier down'); });
    orderEvents.on(orderEvents.STATUS_CHANGED, async () => { throw new Error('sms down'); });
    const p = gw.pay(order);
    const res = await h.success({ val_id: p.val_id }).expect(303);
    expect(res.headers.location).toContain('/order-success');
    expect((await h.orderRow(order.order_id)).status).toBe('confirmed');
    await new Promise((r) => setImmediate(r));
    spy.mockRestore();
  });

  test('no event is emitted when the transaction rolls back', async () => {
    const { order } = await setup();
    const events = [];
    orderEvents.on(orderEvents.STATUS_CHANGED, (e) => events.push(e));
    // Break the stock commit mid-transaction (inventory row gone + no free stock is
    // tolerated), so instead force a failure: drop the history table temporarily.
    await query('ALTER TABLE order_status_history RENAME TO order_status_history_x');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = gw.pay(order);
      const res = await h.success({ val_id: p.val_id }).expect(303);
      expect(res.headers.location).toContain('payment=pending');
    } finally {
      await query('ALTER TABLE order_status_history_x RENAME TO order_status_history');
      spy.mockRestore();
    }
    expect(events).toHaveLength(0);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.txRows(order.order_id)).toHaveLength(0);
  });
});

describe('SEC-01 payment replay / mismatch', () => {
  test('one real payment cannot confirm a different order of the same amount', async () => {
    const s = await h.shop({ quantity: 5 });
    const attacker = await f.user();
    const victim = await f.user();
    const a = await h.placeOrder(attacker.token, s.variant);
    const b = await h.placeOrder(victim.token, s.variant);
    expect(a.total).toBe(b.total);

    const p = gw.pay(a); // attacker pays for their own order once
    // ...and replays the val_id with the victim's order references.
    const forged = { val_id: p.val_id, tran_id: b.order_number, value_a: b.order_id, amount: String(b.total), status: 'VALID' };
    const first = await h.success(forged).expect(303);
    expect(first.headers.location).toBe(`${STORE}/order-success?ref=${a.order_number}`); // their own order, by the gateway's tran_id
    const second = await h.success(forged).expect(303);
    expect(second.headers.location).not.toContain(b.order_number);
    await h.ipn(forged).expect(200);

    expect(await h.orderRow(b.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.txRows(b.order_id)).toHaveLength(0);
    expect(await h.txRows(a.order_id)).toHaveLength(1);
    expect((await query('SELECT COUNT(*)::int AS n FROM transactions')).rows[0].n).toBe(1);
  });

  test.each([
    ['tran_id names another order', (o, other) => ({ tran_id: other.order_number })],
    ['value_a names another order', (o, other) => ({ value_a: other.order_id })],
    ['amount short by ৳1', (o) => ({ amount: (o.total - 1).toFixed(2), currency_amount: (o.total - 1).toFixed(2) })],
    ['amount off by one paisa', (o) => ({ amount: (o.total + 0.01).toFixed(2), currency_amount: (o.total + 0.01).toFixed(2) })],
    ['currency_amount differs', (o) => ({ currency_amount: '1.00' })],
    ['amount not a number', (o) => ({ amount: 'lots', currency_amount: 'lots' })],
    ['currency_type USD', () => ({ currency_type: 'USD' })],
    ['currency USD', () => ({ currency: 'USD' })],
    ['no currency at all', () => ({ currency: '', currency_type: undefined })],
  ])('a gateway record where %s does not confirm anything', async (_, mutate) => {
    const s = await h.shop();
    const c = await f.user();
    const o = await h.placeOrder(c.token, s.variant);
    const other = await h.placeOrder((await f.user()).token, s.variant);
    const p = gw.pay(o, mutate(o, other));

    const res = await h.success({ val_id: p.val_id }).expect(303);
    expect(res.headers.location).toContain('/checkout?payment=failed');
    for (const id of [o.order_id, other.order_id]) {
      expect(await h.orderRow(id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
      expect(await h.txRows(id)).toHaveLength(0);
    }
    expect((await h.stock(s.variant.id, s.branch.id))).toMatchObject({ quantity: 5, reserved: 2 });
  });

  test('a mismatching real payment is flagged for staff (once)', async () => {
    const { order } = await setup();
    const p = gw.pay(order, { amount: '10.00', currency_amount: '10.00' });
    await h.success({ val_id: p.val_id }).expect(303);
    await h.ipn({ val_id: p.val_id }).expect(200);
    const note = (await h.orderRow(order.order_id)).system_note;
    expect(note).toContain(p.val_id);
    expect(note).toContain('amount');
    expect(note.split(p.val_id).length - 1).toBe(1);
  });

  test('VALIDATED for a val_id we never recorded is not accepted from a callback', async () => {
    const s = await h.shop();
    const a = await h.placeOrder((await f.user()).token, s.variant);
    const b = await h.placeOrder((await f.user()).token, s.variant);
    const p = gw.pay(a);
    await gw.client.validatePayment(p.val_id); // someone already validated it → now VALIDATED

    const res = await h.success({ val_id: p.val_id, tran_id: b.order_number, value_a: b.order_id }).expect(303);
    // the ref is only ever the one the caller sent (L2), never looked up
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=pending&ref=${b.order_number}`);
    expect(await h.orderRow(a.order_id)).toMatchObject({ status: 'pending' });
    expect(await h.orderRow(b.order_id)).toMatchObject({ status: 'pending' });
    expect((await query('SELECT COUNT(*)::int AS n FROM transactions')).rows[0].n).toBe(0);

    // Reconciliation by OUR tran_id settles the right order only.
    // b's payment page is still open at the gateway → held until the hard cap
    await h.age(a.order_id, 91);
    await h.age(b.order_id, 91);
    await expiry.run();
    expect(await h.orderRow(a.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    expect(await h.orderRow(b.order_id)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired' });
  });

  test('a gateway payment naming a COD order is refused', async () => {
    const s = await h.shop();
    const c = await f.user();
    const cod = await h.placeOrder(c.token, s.variant, { payment_method: 'cod' });
    const p = gw.pay({ order_number: cod.order_number, order_id: cod.order_id, total: cod.total });
    await h.success({ val_id: p.val_id }).expect(303);
    expect(await h.orderRow(cod.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.txRows(cod.order_id)).toHaveLength(0);
  });

  test('unknown val_id (gateway: INVALID_TRANSACTION) changes nothing', async () => {
    const { order, variant, branch } = await setup();
    const res = await h.success({ val_id: 'nonexistent123', tran_id: order.order_number, value_a: order.order_id }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=${order.order_number}`);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 1 });
  });
});

describe('SEC-02 val_id injection through the callbacks', () => {
  test.each([
    ['x&store_id=evil&store_passwd=evil#'],
    ['abc#'],
    ['a&b'],
    ['a b'],
  ])('success with val_id %j is refused before any gateway call', async (valId) => {
    const { order } = await setup();
    const res = await h.success({ val_id: valId, tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed`);
    expect(gw.client.validatePayment).not.toHaveBeenCalled();
    await h.ipn({ val_id: valId }).expect(400);
    expect(gw.client.validatePayment).not.toHaveBeenCalled();
  });

  test('array / missing val_id is refused', async () => {
    await api.post('/api/v1/payments/success').send({ val_id: ['a', 'b'] }).expect(303);
    await api.post('/api/v1/payments/success').send({}).expect(303);
    await api.post('/api/v1/payments/ipn').send({}).expect(400);
    await api.post('/api/v1/payments/ipn').send({ val_id: ['a'] }).expect(400);
    expect(gw.client.validatePayment).not.toHaveBeenCalled();
  });

  test('tran_id injection in fail/cancel is refused before any gateway call', async () => {
    const res = await h.fail({ tran_id: 'PG-1&store_id=x' }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed`);
    const res2 = await h.cancel({ tran_id: ['a', 'b'] }).expect(303);
    expect(res2.headers.location).toBe(`${STORE}/checkout?payment=cancelled`);
    expect(gw.client.queryByTranId).not.toHaveBeenCalled();
  });
});

describe('BE-02 gateway outage never cancels', () => {
  test('success while the gateway is down → pending redirect, order and stock untouched', async () => {
    const { order, variant, branch } = await setup();
    const p = gw.pay(order);
    gw.state.down = true;
    const res = await h.success({ val_id: p.val_id, tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=pending&ref=${order.order_number}`);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 1 });

    // fail/cancel/IPN during the outage don't cancel either.
    await h.fail({ tran_id: order.order_number }).expect(303);
    await h.cancel({ tran_id: order.order_number }).expect(303);
    // IPN answers the same constant body whatever happened (L2)
    expect((await h.ipn({ val_id: p.val_id }).expect(200)).body).toEqual({ success: true });
    expect((await h.ipn({ tran_id: order.order_number, status: 'FAILED' }).expect(200)).body).toEqual({ success: true });
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });

    // Expiry while down (< 24h): skipped, reservation kept.
    await h.age(order.order_id, 45);
    expect(await expiry.run()).toMatchObject({ checked: 1, skipped: 1, released: 0 });
    expect((await h.orderRow(order.order_id)).status).toBe('pending');

    // Gateway back: the expiry job finds the payment and confirms.
    gw.state.down = false;
    expect(await expiry.run()).toMatchObject({ confirmed: 1 });
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('an unexpected server error in the success callback shows pending, not failed', async () => {
    const { order } = await setup();
    const p = gw.pay(order);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    gw.client.validatePayment.mockImplementationOnce(async () => { throw new Error('boom'); });
    const res = await h.success({ val_id: p.val_id, tran_id: order.order_number }).expect(303);
    spy.mockRestore();
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=pending&ref=${order.order_number}`);
    expect((await h.orderRow(order.order_id)).status).toBe('pending');
  });
});

describe('BE-03 payment for a cancelled / expired order', () => {
  test('paid after the customer-cancelled release → recorded, flagged, never "success"', async () => {
    const { order, variant, branch } = await setup();
    gw.endAttempt(order.order_number, 'CANCELLED');
    await h.cancel({ tran_id: order.order_number }).expect(303);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', cancel_reason: 'cancelled' });

    const p = gw.pay(order);
    const res = await h.success({ val_id: p.val_id, tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=${order.order_number}`);
    const row = await h.orderRow(order.order_id);
    expect(row).toMatchObject({ status: 'cancelled', payment_status: 'completed' });
    expect(row.system_note).toMatch(/refund or reinstatement required/);
    expect(await h.txRows(order.order_id)).toEqual([expect.objectContaining({ payment_status: 'completed', ssl_validation_id: p.val_id })]);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 0 });

    // replay of the same success: still not success
    const again = await h.success({ val_id: p.val_id }).expect(303);
    expect(again.headers.location).toContain('payment=failed');
  });

  test('paid after expiry → note says expired', async () => {
    const { order } = await setup();
    await h.age(order.order_id, 91);
    await expiry.run();
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired' });
    const p = gw.pay(order);
    await h.ipn({ val_id: p.val_id }).expect(200);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'completed' });
    expect((await h.orderRow(order.order_id)).system_note).toMatch(/after the order was expired/);
  });
});

describe('SEC-10 fail / cancel callbacks ask the gateway', () => {
  test('a forged fail callback on a paid order changes nothing', async () => {
    const { order, variant, branch } = await setup();
    const p = gw.pay(order);
    await h.success({ val_id: p.val_id }).expect(303);
    const res = await h.fail({ tran_id: order.order_number, value_a: order.order_id }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=${order.order_number}`);
    await h.cancel({ tran_id: order.order_number }).expect(303);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('a forged fail while the customer is still on the payment page does not release', async () => {
    const { order, variant, branch } = await setup();
    await h.fail({ tran_id: order.order_number }).expect(303);
    expect(gw.client.queryByTranId).toHaveBeenCalledWith(order.order_number);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 1 });
  });

  test('a forged fail for an order with no gateway attempt at all does not release', async () => {
    const { order } = await setup();
    gw.state.attempts.clear();
    await h.fail({ tran_id: order.order_number }).expect(303);
    expect((await h.orderRow(order.order_id)).status).toBe('pending');
  });

  test('genuine cancel (gateway shows CANCELLED) releases stock and the coupon', async () => {
    const s = await h.shop();
    const c = await f.user();
    const { rows: [coupon] } = await query(
      `INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until, max_uses)
       VALUES ('SAVE10', 'percentage', 10, NOW() - interval '1 day', NOW() + interval '1 day', 5) RETURNING *`
    );
    const order = await h.placeOrder(c.token, s.variant, { coupon_code: 'save10' });
    expect((await query('SELECT used_count FROM coupons WHERE id = $1', [coupon.id])).rows[0].used_count).toBe(1);

    gw.endAttempt(order.order_number, 'CANCELLED');
    const res = await h.cancel({ tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=cancelled&ref=${order.order_number}`);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'cancelled', cancel_reason: 'cancelled' });
    expect(await h.stock(s.variant.id, s.branch.id)).toMatchObject({ quantity: 5, reserved: 0 });
    expect((await query('SELECT used_count FROM coupons WHERE id = $1', [coupon.id])).rows[0].used_count).toBe(0);
    expect((await query('SELECT released_at FROM coupon_redemptions WHERE order_id = $1', [order.order_id])).rows[0].released_at).toBeTruthy();
    expect((await historyOf(order.order_id)).map((x) => x.to_status)).toEqual(['pending', 'cancelled']);

    // A second cancel is a no-op.
    await h.cancel({ tran_id: order.order_number }).expect(303);
    expect((await query('SELECT used_count FROM coupons WHERE id = $1', [coupon.id])).rows[0].used_count).toBe(0);
  });

  test('genuine failure (gateway shows FAILED) → payment_status failed', async () => {
    const { order } = await setup();
    gw.endAttempt(order.order_number, 'FAILED');
    await h.fail({ tran_id: order.order_number }).expect(303);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'failed', cancel_reason: 'failed' });
  });

  test('fail callback for an order the gateway shows as PAID confirms it (same redirect as always)', async () => {
    const { order } = await setup();
    gw.pay(order);
    const res = await h.fail({ tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=${order.order_number}`);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
  });

  test('unknown tran_id → the same redirect shape as a known one', async () => {
    const res = await h.fail({ tran_id: 'PG-20990101-999999' }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=PG-20990101-999999`);
  });
});

describe('risk level 1 → held for review', () => {
  test('recorded as processing, not confirmed, not expired, released by owner approval', async () => {
    const { order, variant, branch } = await setup();
    const p = gw.pay(order, { risk_level: '1', risk_title: 'Risky card' });
    const res = await h.success({ val_id: p.val_id, tran_id: order.order_number }).expect(303);
    expect(res.headers.location).toBe(`${STORE}/checkout?payment=pending&ref=${order.order_number}`);

    const row = await h.orderRow(order.order_id);
    expect(row).toMatchObject({ status: 'pending', payment_status: 'processing' });
    expect(row.system_note).toMatch(/risky/);
    expect(await h.txRows(order.order_id)).toEqual([expect.objectContaining({ payment_status: 'processing', ssl_risk_level: '1' })]);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 1 });

    // replay → still held, no duplicate row
    await h.ipn({ val_id: p.val_id }).expect(200);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'processing' });
    expect(await h.txRows(order.order_id)).toHaveLength(1);

    // the expiry job leaves held payments alone
    await h.age(order.order_id, 600);
    expect(await expiry.run()).toMatchObject({ checked: 0 });
    // a forged fail can't release it either
    await h.fail({ tran_id: order.order_number }).expect(303);
    expect((await h.orderRow(order.order_id)).status).toBe('pending');

    // branch staff can't approve; the owner can, which promotes the held payment
    const manager = await f.user({ role: 'branch_admin', branch_id: branch.id });
    await api.patch(`/api/v1/orders/${order.order_id}/status`).set(f.auth(manager.token))
      .send({ status: 'confirmed', mark_paid: true, note: 'checked panel' }).expect(403);
    const admin = await f.user({ role: 'super_admin' });
    await api.patch(`/api/v1/orders/${order.order_id}/status`).set(f.auth(admin.token))
      .send({ status: 'confirmed', mark_paid: true, note: 'Verified in SSLCommerz panel' }).expect(200);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
    const txs = await h.txRows(order.order_id);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ payment_status: 'completed', recorded_by: admin.user.id });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });
});

describe('concurrency', () => {
  test('IPN and success at the same time → one confirmation, one transaction', async () => {
    const { order, variant, branch } = await setup();
    const p = gw.pay(order);
    const results = await Promise.all([
      h.success({ val_id: p.val_id }),
      h.ipn({ val_id: p.val_id }),
      h.success({ val_id: p.val_id }),
      h.ipn({ val_id: p.val_id }),
    ]);
    for (const r of results) expect([200, 303]).toContain(r.status);
    expect(await h.txRows(order.order_id)).toHaveLength(1);
    expect((await historyOf(order.order_id)).filter((x) => x.to_status === 'confirmed')).toHaveLength(1);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('even when the gateway answers VALID to every caller', async () => {
    const { order, variant, branch } = await setup();
    const p = gw.pay(order);
    // Gateway never flips to VALIDATED: every concurrent handler passes the checks.
    const original = gw.client.validatePayment.getMockImplementation();
    gw.client.validatePayment.mockImplementation(async () => ({ ...gw.state.payments.get(p.val_id) }));
    let results;
    try {
      results = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? h.ipn : h.success)({ val_id: p.val_id })));
    } finally {
      gw.client.validatePayment.mockImplementation(original);
    }
    const locations = results.filter((r) => r.status === 303).map((r) => r.headers.location);
    for (const l of locations) expect(l).toBe(`${STORE}/order-success?ref=${order.order_number}`);
    expect(await h.txRows(order.order_id)).toHaveLength(1);
    expect((await historyOf(order.order_id)).filter((x) => x.to_status === 'confirmed')).toHaveLength(1);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });

  test('a payment arriving while expiry releases the order: exactly one of them wins', async () => {
    const { order, variant, branch } = await setup();
    await h.age(order.order_id, 31);
    const p = gw.pay(order);
    await Promise.all([expiry.run(), h.success({ val_id: p.val_id })]);
    const row = await h.orderRow(order.order_id);
    expect(row.status).toBe('confirmed');
    expect(await h.txRows(order.order_id)).toHaveLength(1);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
  });
});

describe('IPN', () => {
  test('validated IPN confirms and answers JSON', async () => {
    const { order } = await setup();
    const p = gw.pay(order);
    const res = await h.ipn({ val_id: p.val_id, tran_id: order.order_number, status: 'VALID' }).expect(200);
    expect(res.body).toEqual({ success: true });
    expect((await h.orderRow(order.order_id)).status).toBe('confirmed');
  });

  test('failure IPN without val_id releases only when the gateway agrees', async () => {
    const { order } = await setup();
    await h.ipn({ tran_id: order.order_number, status: 'FAILED' }).expect(200);
    expect((await h.orderRow(order.order_id)).status).toBe('pending'); // attempt still open
    gw.endAttempt(order.order_number, 'FAILED');
    await h.ipn({ tran_id: order.order_number, status: 'FAILED', val_id: '' }).expect(200);
    expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'failed' });
  });
});

describe('POST /payments/retry/:orderNumber', () => {
  const retry = (token, n) => api.post(`/api/v1/payments/retry/${encodeURIComponent(n)}`).set(token ? f.auth(token) : {});

  test('owner gets a fresh gateway session; others cannot', async () => {
    const { order, token } = await setup();
    const res = await retry(token, order.order_number).expect(200);
    expect(res.body.data.redirect_url).toMatch(/^https:\/\/sandbox\.sslcommerz\.com\//);
    expect(gw.client.createSession).toHaveBeenCalledTimes(2);

    await retry(null, order.order_number).expect(401);
    const other = await f.user();
    await retry(other.token, order.order_number).expect(404);
    await retry(token, 'PG-1&x=1').expect(400);
  });

  test('if the gateway already has the payment, it confirms instead of charging twice', async () => {
    const { order, token } = await setup();
    gw.pay(order); // callback lost
    const res = await retry(token, order.order_number).expect(200);
    expect(res.body.data).toMatchObject({ redirect_url: null, status: 'confirmed', payment_status: 'completed' });
    expect(gw.client.createSession).toHaveBeenCalledTimes(1);
  });

  test('refused for COD, settled and expired orders; 503 when the gateway is down', async () => {
    const s = await h.shop();
    const c = await f.user();
    const cod = await h.placeOrder(c.token, s.variant, { payment_method: 'cod' });
    await retry(c.token, cod.order_number).expect(409);

    const o = await h.placeOrder(c.token, s.variant);
    gw.state.down = true;
    await retry(c.token, o.order_number).expect(503);
    gw.state.down = false;
    gw.state.sessionDown = true;
    await retry(c.token, o.order_number).expect(503);
    gw.state.sessionDown = false;

    await h.age(o.order_id, 31);
    await retry(c.token, o.order_number).expect(409);

    const paid = await h.placeOrder(c.token, s.variant);
    const p = gw.pay(paid);
    await h.success({ val_id: p.val_id }).expect(303);
    await retry(c.token, paid.order_number).expect(409);
  });
});

describe('GET /payments/orders/:orderId/reconcile', () => {
  const reconcile = (token, id) => api.get(`/api/v1/payments/orders/${id}/reconcile`).set(token ? f.auth(token) : {});

  test('authz: anonymous 401, customer 403, every branch admin 403 (super admin only), owner OK', async () => {
    const { order, token, branch } = await setup();
    const other = await f.branch();
    await reconcile(null, order.order_id).expect(401);
    await reconcile(token, order.order_id).expect(403);
    const outsider = await f.user({ role: 'branch_admin', branch_id: other.id });
    await reconcile(outsider.token, order.order_id).expect(403);
    const manager = await f.user({ role: 'branch_admin', branch_id: branch.id });
    await reconcile(manager.token, order.order_id).expect(403);
    const admin = await f.user({ role: 'super_admin' });
    await reconcile(admin.token, order.order_id).expect(200);
    await reconcile(admin.token, 'not-a-uuid').expect(400);
  });

  test('confirms a payment whose callbacks never arrived; no raw payload exposed', async () => {
    const { order } = await setup();
    const p = gw.pay(order);
    const admin = await f.user({ role: 'super_admin' });
    const res = await api.get(`/api/v1/payments/orders/${order.order_id}/reconcile`).set(f.auth(admin.token)).expect(200);
    expect(res.body.data).toMatchObject({ outcome: 'success', status: 'confirmed', payment_status: 'completed' });
    expect(res.body.data.gateway).toEqual([expect.objectContaining({ status: 'VALID', val_id: p.val_id, amount: p.amount })]);
    expect(JSON.stringify(res.body)).not.toMatch(/value_a|store_passwd|APIConnect/);
    const audit = await query(`SELECT * FROM admin_audit_log WHERE action = 'order.reconcile'`);
    expect(audit.rows).toHaveLength(1);

    // again: idempotent
    await api.get(`/api/v1/payments/orders/${order.order_id}/reconcile`).set(f.auth(admin.token)).expect(200);
    expect(await h.txRows(order.order_id)).toHaveLength(1);
  });

  test('releases when the gateway shows the attempt failed; 503 when down; 409 for COD', async () => {
    const { order, user } = await setup();
    const admin = await f.user({ role: 'super_admin' });
    gw.endAttempt(order.order_number, 'FAILED');
    gw.state.down = true;
    await reconcile(admin.token, order.order_id).expect(503);
    gw.state.down = false;
    const res = await reconcile(admin.token, order.order_id).expect(200);
    expect(res.body.data).toMatchObject({ outcome: 'released', status: 'cancelled' });

    const s = await h.shop();
    const cod = await h.placeOrder((await f.user()).token, s.variant, { payment_method: 'cod' });
    await reconcile(admin.token, cod.order_id).expect(409);
    expect(user).toBeTruthy();
  });
});

test('legacy /payments/initiate and /validate stubs are gone', async () => {
  const { token } = await f.user();
  await api.post('/api/v1/payments/initiate').set(f.auth(token)).send({}).expect(404);
  await api.get('/api/v1/payments/validate/abc').set(f.auth(token)).expect(404);
});
