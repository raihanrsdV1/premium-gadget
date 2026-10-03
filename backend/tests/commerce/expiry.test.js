jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const expiry = require('../../src/jobs/reservationExpiry');
const jobs = require('../../src/jobs');
const orderEvents = require('../../src/events/orderEvents');

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
beforeEach(h.reset);
afterEach(() => orderEvents.removeAllListeners());

const newOrder = async (variant, overrides) => {
  const c = await f.user();
  return { ...(await h.placeOrder(c.token, variant, overrides)), customer: c };
};

test('registered in the job runner every 60s', () => {
  expect(jobs.JOBS).toContain(expiry);
  expect(expiry).toMatchObject({ name: 'reservation-expiry', intervalMs: 60000 });
  expect(typeof expiry.run).toBe('function');
});

test('releases an expired unpaid order: stock, coupon, status, history, event', async () => {
  const { variant, branch } = await h.shop();
  await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
               VALUES ('E1', 'fixed', 100, NOW() - interval '1 day', NOW() + interval '1 day')`);
  const o = await newOrder(variant, { coupon_code: 'E1' });
  await h.age(o.order_id, 91);
  const events = [];
  orderEvents.on(orderEvents.STATUS_CHANGED, (e) => events.push(e));

  expect(await expiry.run()).toMatchObject({ checked: 1, released: 1, confirmed: 0, errors: 0 });
  expect(await h.orderRow(o.order_id)).toMatchObject({ status: 'cancelled', payment_status: 'cancelled', cancel_reason: 'expired' });
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 0 });
  expect((await query('SELECT used_count FROM coupons')).rows[0].used_count).toBe(0);
  const hist = (await query(`SELECT to_status, note, actor_id FROM order_status_history WHERE order_id = $1 ORDER BY created_at`, [o.order_id])).rows;
  expect(hist[1]).toMatchObject({ to_status: 'cancelled', note: expect.stringMatching(/expired/), actor_id: null });
  expect(events).toEqual([expect.objectContaining({ from: 'pending', to: 'cancelled', actor: null })]);
  expect(gw.client.queryByTranId).toHaveBeenCalledWith(o.order_number);

  // idempotent
  expect(await expiry.run()).toMatchObject({ checked: 0 });
});

test('leaves fresh, COD, held, paid and POS orders alone', async () => {
  const { variant, branch } = await h.shop({ quantity: 10 });
  const fresh = await newOrder(variant);
  await h.age(fresh.order_id, 29);
  const cod = await newOrder(variant, { payment_method: 'cod' });
  await h.age(cod.order_id, 600);
  const held = await newOrder(variant);
  await h.success({ val_id: gw.pay(held, { risk_level: '1' }).val_id }).expect(303);
  await h.age(held.order_id, 600);
  const paid = await newOrder(variant);
  await h.success({ val_id: gw.pay(paid).val_id }).expect(303);
  await h.age(paid.order_id, 600);
  await query(
    `INSERT INTO orders (order_number, branch_id, channel, status, subtotal, total_amount, payment_method, created_at)
     VALUES ('PG-20250101-000777', $1, 'pos', 'pending', 100, 100, 'cash', NOW() - interval '2 days')`,
    [branch.id]
  );

  expect(await expiry.run()).toMatchObject({ checked: 0 });
  expect((await h.orderRow(fresh.order_id)).status).toBe('pending');
  expect((await h.orderRow(cod.order_id)).status).toBe('pending');
  expect(await h.orderRow(held.order_id)).toMatchObject({ status: 'pending', payment_status: 'processing' });
  expect((await h.orderRow(paid.order_id)).status).toBe('confirmed');
});

test('uses checkout.reservation_minutes from settings', async () => {
  const { variant } = await h.shop({ quantity: 10 });
  await h.setSetting('checkout', { cod_enabled: true, reservation_minutes: 10, pending_order_limit: 3 });
  const a = await newOrder(variant);
  const b = await newOrder(variant);
  const c = await newOrder(variant);
  gw.endAttempt(a.order_number, 'CANCELLED'); // a's attempt is over; b's and c's pages are open
  await h.age(a.order_id, 11);
  await h.age(b.order_id, 9);
  await h.age(c.order_id, 69);
  expect(await expiry.run()).toMatchObject({ checked: 2, released: 1, skipped: 1 });
  expect((await h.orderRow(a.order_id)).status).toBe('cancelled');
  expect((await h.orderRow(b.order_id)).status).toBe('pending');
  expect((await h.orderRow(c.order_id)).status).toBe('pending');
  await h.age(c.order_id, 71); // reservation (10) + 60 min hard cap
  expect(await expiry.run()).toMatchObject({ released: 1 });
  expect((await h.orderRow(c.order_id)).status).toBe('cancelled');
});

test('a payment the callbacks missed is confirmed, not released', async () => {
  const { variant, branch } = await h.shop();
  const o = await newOrder(variant);
  gw.pay(o);
  await h.age(o.order_id, 45);
  expect(await expiry.run()).toMatchObject({ confirmed: 1, released: 0 });
  expect(await h.orderRow(o.order_id)).toMatchObject({ status: 'confirmed', payment_status: 'completed' });
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 4, reserved: 0 });
});

test('a paid-but-mismatching gateway record is flagged and the order still expires', async () => {
  const { variant, branch } = await h.shop();
  const o = await newOrder(variant);
  const p = gw.pay(o, { amount: '1.00', currency_amount: '1.00' });
  await h.age(o.order_id, 45);
  expect(await expiry.run()).toMatchObject({ released: 1 });
  const row = await h.orderRow(o.order_id);
  expect(row).toMatchObject({ status: 'cancelled', cancel_reason: 'expired' });
  expect(row.system_note).toContain(p.val_id);
  expect(await h.txRows(o.order_id)).toHaveLength(0);
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 0 });
});

test('gateway unavailable: skipped until 24h, then released', async () => {
  const { variant, branch } = await h.shop();
  const o = await newOrder(variant);
  gw.state.down = true;
  await h.age(o.order_id, 23 * 60);
  expect(await expiry.run()).toMatchObject({ checked: 1, skipped: 1, released: 0 });
  expect((await h.orderRow(o.order_id)).status).toBe('pending');
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 1 });

  await h.age(o.order_id, 24 * 60 + 1);
  expect(await expiry.run()).toMatchObject({ released: 1 });
  const row = await h.orderRow(o.order_id);
  expect(row).toMatchObject({ status: 'cancelled', cancel_reason: 'expired' });
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 0 });
});

test('processes many orders in batches; one failing order does not stop the rest', async () => {
  const { variant, branch } = await h.shop({ quantity: 100 });
  const users = await Promise.all(Array.from({ length: 45 }, () => f.user()));
  const orders = [];
  for (const u of users) orders.push(await h.placeOrder(u.token, variant));
  await query(`UPDATE orders SET created_at = NOW() - interval '2 hours'`);

  const broken = orders[7].order_number;
  const original = gw.client.queryByTranId.getMockImplementation();
  gw.client.queryByTranId.mockImplementation(async (tranId) => {
    if (tranId === broken) throw new Error('unexpected bug');
    return original(tranId);
  });
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await expiry.run()).toEqual({ checked: 45, confirmed: 0, released: 44, held: 0, skipped: 0, errors: 1 });
  } finally {
    gw.client.queryByTranId.mockImplementation(original);
    spy.mockRestore();
  }
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 100, reserved: 1 });
  expect(await expiry.run()).toMatchObject({ checked: 1, released: 1 });
});

test('two job runs at once release each order exactly once', async () => {
  const { variant, branch } = await h.shop({ quantity: 10 });
  const orders = [];
  for (let i = 0; i < 6; i++) orders.push(await newOrder(variant));
  await query(`UPDATE orders SET created_at = NOW() - interval '2 hours'`);
  const [a, b] = await Promise.all([expiry.run(), expiry.run()]);
  expect(a.released + b.released).toBe(6);
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 10, reserved: 0 });
  const releases = (await query(`SELECT COUNT(*)::int AS n FROM stock_movements WHERE movement_type = 'release'`)).rows[0].n;
  expect(releases).toBe(6);
  const cancels = (await query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE to_status = 'cancelled'`)).rows[0].n;
  expect(cancels).toBe(6);
});

test('runOnce never overlaps a run with itself', async () => {
  const { variant } = await h.shop();
  const o = await newOrder(variant);
  await h.age(o.order_id, 91);
  await Promise.all([jobs.runOnce(expiry), jobs.runOnce(expiry)]);
  expect(gw.client.queryByTranId).toHaveBeenCalledTimes(1);
  expect((await h.orderRow(o.order_id)).status).toBe('cancelled');
});
