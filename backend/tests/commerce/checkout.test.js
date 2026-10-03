jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());

const { api, query, factories: f } = require('../helpers');
const gw = require('./_gateway');
const h = require('./_helpers');
const expiry = require('../../src/jobs/reservationExpiry');

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
beforeEach(h.reset);

describe('POST /orders/checkout — validation', () => {
  let token;
  let variant;
  beforeEach(async () => {
    ({ token } = await f.user());
    ({ variant } = await h.shop());
  });

  const bad = (overrides) => h.checkout(token, h.checkoutBody(variant, overrides)).expect(400);

  test('anonymous → 401', async () => {
    await api.post('/api/v1/orders/checkout').send(h.checkoutBody(variant)).expect(401);
  });

  test.each([
    ['no items', { items: [] }],
    ['items not an array', { items: { variant_id: 'x' } }],
    ['quantity 0', { items: [{ variant_id: '00000000-0000-4000-8000-000000000000', quantity: 0 }] }],
    ['quantity 11', { items: [{ variant_id: '00000000-0000-4000-8000-000000000000', quantity: 11 }] }],
    ['fractional quantity', { items: [{ variant_id: '00000000-0000-4000-8000-000000000000', quantity: 1.5 }] }],
    ['string quantity', { items: [{ variant_id: '00000000-0000-4000-8000-000000000000', quantity: '1' }] }],
    ['bad variant id', { items: [{ variant_id: 'abc', quantity: 1 }] }],
    ['unknown payment method', { payment_method: 'cash' }],
    ['shipping method not a code', { shipping_method: 'Inside Dhaka' }],
    ['shipping method array', { shipping_method: ['inside_dhaka'] }],
    ['no shipping address', { shipping_address: undefined }],
    ['customer note over 500', { customer_note: 'x'.repeat(501) }],
    ['coupon code over 40', { coupon_code: 'X'.repeat(41) }],
    ['address_id not a uuid', { address_id: 'nope' }],
  ])('%s → 400', async (_, overrides) => {
    await bad(overrides);
  });

  test('more than 20 lines / duplicate variants → 400', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ variant_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, quantity: 1 }));
    await bad({ items: many });
    await bad({ items: [{ variant_id: variant.id, quantity: 1 }, { variant_id: variant.id, quantity: 2 }] });
  });

  test.each([
    ['one-letter full_name', { full_name: 'R' }],
    ['bad phone', { phone: '12345' }],
    ['landline', { phone: '0312345678' }],
    ['unknown division', { division: 'Narnia' }],
    ['missing district', { district: undefined }],
    ['missing street', { street: '' }],
    ['bad postal code', { postal_code: '12' }],
    ['street too long', { street: 'x'.repeat(256) }],
  ])('shipping_address %s → 400', async (_, patch) => {
    await bad({ shipping_address: { ...h.ADDRESS, ...patch } });
  });

  test('unknown (well-formed) shipping zone → 400 and nothing reserved', async () => {
    const res = await bad({ shipping_method: 'mars' });
    expect(res.body.message).toMatch(/shipping method/i);
    const { rows } = await query('SELECT SUM(reserved)::int AS r FROM inventory');
    expect(rows[0].r).toBe(0);
  });

  test('blank recipient name/phone fall back to the account (storefront pre-fill)', async () => {
    const me = await f.user({ full_name: 'Karim Ahmed', phone: '01811000222' });
    const res = await h.checkout(me.token, h.checkoutBody(variant, {
      shipping_address: { full_name: '', phone: '  ', division: 'Chattogram', district: 'Chattogram', street: 'Road 4, Banani' },
    })).expect(201);
    expect((await h.orderRow(res.body.data.order_id)).shipping_address).toMatchObject({ full_name: 'Karim Ahmed', phone: '01811000222' });
    await h.checkout(me.token, h.checkoutBody(variant, { shipping_address: ['x'] })).expect(400);
    await h.checkout(me.token, h.checkoutBody(variant, { shipping_address: 'x' })).expect(400);
  });

  test('normalises phone and division aliases; blank optional fields are fine', async () => {
    const res = await h.checkout(token, h.checkoutBody(variant, {
      shipping_address: { ...h.ADDRESS, phone: '+880 1711-000111', division: 'chittagong', area: '', postal_code: '' },
    })).expect(201);
    const row = await h.orderRow(res.body.data.order_id);
    expect(row.shipping_address).toEqual({
      full_name: 'Rahim Uddin', phone: '01711000111', division: 'Chattogram', district: 'Chattogram',
      area: null, street: 'House 12, Road 4, Banani', postal_code: null,
    });
  });
});

describe('POST /orders/checkout — pricing, stock and snapshot', () => {
  test('server-side effective price, totals, snapshot, branch and line fields', async () => {
    const { branch, variant } = await h.shop({ price: 50000 });
    await query(`UPDATE product_variants SET sale_price = 45000, sale_starts_at = NOW() - interval '1 hour' WHERE id = $1`, [variant.id]);
    const { token } = await f.user();
    const res = await h.checkout(token, {
      ...h.checkoutBody(variant, { customer_note: 'Call before delivery' }),
      items: [{ variant_id: variant.id, quantity: 2, unit_price: 1, price: 1 }],
      total: 1,
      status: 'confirmed',
      payment_status: 'completed',
    }).expect(201);

    const data = res.body.data;
    expect(data).toMatchObject({ total: 90100, payment_method: 'card', status: 'pending', payment_status: 'pending' });
    expect(data.order_number).toMatch(/^PG-\d{8}-\d{6}$/);
    expect(data.redirect_url).toMatch(/sslcommerz\.com/);

    const row = await h.orderRow(data.order_id);
    expect(row).toMatchObject({
      status: 'pending', payment_status: 'pending', payment_method: 'card', channel: 'online',
      subtotal: '90000.00', discount: '0.00', shipping_fee: '100.00', total_amount: '90100.00',
      shipping_method: 'inside_chattogram', branch_id: branch.id,
    });
    expect(row.customer_note).toMatch(/^Ship to: Rahim Uddin, 01711000111, House 12/);
    expect(row.customer_note).toMatch(/Note: Call before delivery/);

    const items = (await query('SELECT * FROM order_items WHERE order_id = $1', [data.order_id])).rows;
    expect(items).toEqual([expect.objectContaining({
      quantity: 2, unit_price: '45000.00', list_price: '45000.00', total_price: '90000.00', branch_id: branch.id, sku: variant.sku,
    })]);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 2 });
    const ledger = (await query(`SELECT movement_type, quantity_delta FROM stock_movements WHERE reference_id = $1`, [data.order_id])).rows;
    expect(ledger).toEqual([{ movement_type: 'reservation', quantity_delta: -2 }]);
    const hist = (await query('SELECT from_status, to_status FROM order_status_history WHERE order_id = $1', [data.order_id])).rows;
    expect(hist).toEqual([{ from_status: null, to_status: 'pending' }]);
  });

  test('a sale that has not started (or has ended) is not applied', async () => {
    const { variant } = await h.shop({ price: 50000 });
    await query(`UPDATE product_variants SET sale_price = 1000, sale_starts_at = NOW() + interval '1 day' WHERE id = $1`, [variant.id]);
    const { token } = await f.user();
    const data = await h.placeOrder(token, variant);
    expect(data.total).toBe(50100);
  });

  test('reserves on the branch with the most available stock; per-line branches', async () => {
    const b1 = await f.branch();
    const b2 = await f.branch();
    const closed = await f.branch({ is_active: false });
    const { variants: [v] } = await f.product({
      variants: [{ price: 1000, stock: [
        { branch_id: b1.id, quantity: 5, reserved: 4 }, // 1 free
        { branch_id: b2.id, quantity: 3 }, // 3 free
        { branch_id: closed.id, quantity: 50 }, // inactive branch: never used
      ] }],
    });
    const w = await h.variantAt(b1.id, { price: 2000, quantity: 2 });
    const { token } = await f.user();
    const data = await h.placeOrder(token, v, {
      items: [{ variant_id: v.id, quantity: 2 }, { variant_id: w.id, quantity: 1 }],
    });
    const row = await h.orderRow(data.order_id);
    expect(row.branch_id).toBe(b2.id); // branch of the first line
    const items = (await query('SELECT variant_id, branch_id FROM order_items WHERE order_id = $1', [data.order_id])).rows;
    expect(Object.fromEntries(items.map((i) => [i.variant_id, i.branch_id]))).toEqual({ [v.id]: b2.id, [w.id]: b1.id });
    expect(await h.stock(v.id, b2.id)).toMatchObject({ reserved: 2 });
    expect(await h.stock(v.id, b1.id)).toMatchObject({ reserved: 4 });

    // 4 units: no single active branch has 4 free → 409
    await h.checkout(token, h.checkoutBody(v, { items: [{ variant_id: v.id, quantity: 4 }] })).expect(409);
  });

  test('a failure on a later line rolls back earlier reservations', async () => {
    const { branch, variant } = await h.shop({ quantity: 5 });
    const empty = await h.variantAt(branch.id, { quantity: 0 });
    const { token } = await f.user();
    const res = await h.checkout(token, h.checkoutBody(variant, {
      items: [{ variant_id: variant.id, quantity: 2 }, { variant_id: empty.id, quantity: 1 }],
    })).expect(409);
    expect(res.body.message).toMatch(/out of stock/);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 0 });
    expect((await query('SELECT COUNT(*)::int AS n FROM orders')).rows[0].n).toBe(0);
  });

  test('inactive / missing products → 404', async () => {
    const { variant, product } = await h.shop();
    const { token } = await f.user();
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);
    await h.checkout(token, h.checkoutBody(variant)).expect(404);
    await h.checkout(token, h.checkoutBody({ id: '00000000-0000-4000-8000-000000000000' })).expect(404);
  });

  test('address_id must belong to the customer', async () => {
    const { variant } = await h.shop();
    const me = await f.user();
    const other = await f.user();
    const addr = async (userId) => (await query(
      `INSERT INTO addresses (user_id, full_name, phone, division, district, area, street)
       VALUES ($1, 'X Y', '01711000111', 'Dhaka', 'Dhaka', 'Banani', 'Road 1') RETURNING id`, [userId]
    )).rows[0].id;
    await h.checkout(me.token, h.checkoutBody(variant, { address_id: await addr(other.user.id) })).expect(404);
    const mine = await addr(me.user.id);
    const data = await h.placeOrder(me.token, variant, { address_id: mine });
    expect((await h.orderRow(data.order_id)).address_id).toBe(mine);
  });

  test('gateway session failure: order placed and reserved, redirect_url null, generic error', async () => {
    const { variant, branch } = await h.shop();
    const { token } = await f.user();
    gw.state.sessionDown = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const data = await h.placeOrder(token, variant);
    spy.mockRestore();
    expect(data.redirect_url).toBeNull();
    expect(data.gateway_error).toMatch(/unavailable/);
    expect(data.gateway_error).not.toMatch(/SSLCommerz request/);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 1 });
  });
});

describe('shipping zones and free shipping', () => {
  const CTG = { ...h.ADDRESS, division: 'Chattogram', district: 'Chattogram', street: 'House 3, Agrabad' };
  const DHAKA = { ...h.ADDRESS, division: 'Dhaka', district: 'Dhaka', street: 'Road 4, Banani' };

  test('the zone (and fee) comes from the address; shipping_method may be omitted', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 10 });
    const { token } = await f.user();
    const ctg = await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: CTG });
    expect(ctg.total).toBe(1100);
    expect((await h.orderRow(ctg.order_id)).shipping_method).toBe('inside_chattogram');
    const dhaka = await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: DHAKA });
    expect(dhaka.total).toBe(1200);
    expect((await h.orderRow(dhaka.order_id)).shipping_method).toBe('outside_chattogram');
    // naming the right zone explicitly is fine; district matching ignores case/space
    const ok = await h.placeOrder((await f.user()).token, variant, { shipping_method: 'inside_chattogram', shipping_address: { ...h.ADDRESS, district: '  chattogram ' } });
    expect(ok.total).toBe(1100);
  });

  test('zones edited in settings take effect; threshold makes shipping free', async () => {
    const { variant } = await h.shop({ price: 1000, quantity: 10 });
    const { token } = await f.user();
    await h.setSetting('shipping', {
      zones: [
        { code: 'ctg_city', label: 'Chattogram city', fee: 60, eta: 'same day', districts: ['Chattogram'], divisions: [], is_default: false },
        { code: 'sylhet_div', label: 'Sylhet division', fee: 120, eta: null, districts: [], divisions: ['Sylhet'], is_default: false },
        { code: 'rest', label: 'Rest of Bangladesh', fee: 150, eta: null, districts: [], divisions: [], is_default: true },
      ],
      free_shipping_threshold: 2000,
    });
    await h.checkout(token, h.checkoutBody(variant, { shipping_method: 'inside_dhaka' })).expect(400);
    const one = await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: CTG });
    expect(one.total).toBe(1060);
    const syl = await h.placeOrder(token, variant, { shipping_method: undefined, shipping_address: { ...h.ADDRESS, division: 'Sylhet', district: 'Moulvibazar' } });
    expect(syl.total).toBe(1120);
    const two = await h.placeOrder((await f.user()).token, variant, { shipping_method: 'rest', shipping_address: DHAKA, items: [{ variant_id: variant.id, quantity: 2 }] });
    expect(two.total).toBe(2000);
    expect((await h.orderRow(two.order_id)).shipping_fee).toBe('0.00');
  });

  test('threshold uses the pre-discount subtotal', async () => {
    const { variant } = await h.shop({ price: 2000 });
    const { token } = await f.user();
    await h.setSetting('shipping', { zones: [{ code: 'inside_chattogram', label: 'In', fee: 100, eta: null, is_default: true }], free_shipping_threshold: 2000 });
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('TENOFF', 'fixed', 10, NOW() - interval '1 day', NOW() + interval '1 day')`);
    const o = await h.placeOrder(token, variant, { coupon_code: 'TENOFF' });
    expect(o.total).toBe(1990);
  });
});

describe('pending unpaid order cap', () => {
  test('default cap 3 → the 4th is a 409; paying one frees a slot', async () => {
    const { variant } = await h.shop({ quantity: 10 });
    const { token } = await f.user();
    const orders = [];
    for (let i = 0; i < 3; i++) orders.push(await h.placeOrder(token, variant));
    const res = await h.checkout(token, h.checkoutBody(variant)).expect(409);
    expect(res.body.message).toMatch(/unpaid orders/);

    const p = gw.pay(orders[0]);
    await h.success({ val_id: p.val_id }).expect(303);
    await h.placeOrder(token, variant);
    // other customers are unaffected
    await h.placeOrder((await f.user()).token, variant);
  });

  test('COD orders count; the cap comes from settings', async () => {
    const { variant } = await h.shop({ quantity: 10 });
    const { token } = await f.user();
    await h.setSetting('checkout', { cod_enabled: true, reservation_minutes: 30, pending_order_limit: 1 });
    await h.placeOrder(token, variant, { payment_method: 'cod' });
    await h.checkout(token, h.checkoutBody(variant)).expect(409);
  });

  test('parallel checkouts by one customer cannot exceed the cap', async () => {
    const { variant, branch } = await h.shop({ quantity: 10 });
    const { token } = await f.user();
    const results = await Promise.all(Array.from({ length: 6 }, () => h.checkout(token, h.checkoutBody(variant))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 3 });
  });
});

describe('cash on delivery', () => {
  test('COD order: pending, reserved, no gateway call; released only after cod_confirm_hours', async () => {
    const { variant, branch } = await h.shop();
    const { token } = await f.user();
    const data = await h.placeOrder(token, variant, { payment_method: 'cod' });
    expect(data).toMatchObject({ redirect_url: null, payment_method: 'cod', status: 'pending', payment_status: 'pending' });
    expect(data.gateway_error).toBeUndefined();
    expect(gw.client.createSession).not.toHaveBeenCalled();
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 1 });

    await h.age(data.order_id, 23 * 60);
    expect(await expiry.run()).toMatchObject({ checked: 0 });
    expect((await h.orderRow(data.order_id)).status).toBe('pending');
    await h.age(data.order_id, 24 * 60 + 1);
    expect(await expiry.run()).toMatchObject({ checked: 1, released: 1 });
    expect(await h.orderRow(data.order_id)).toMatchObject({ status: 'cancelled', cancel_reason: 'expired', payment_status: 'cancelled' });
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 5, reserved: 0 });
    expect(gw.client.queryByTranId).not.toHaveBeenCalled();
  });

  test('disabled in settings → 400; unverified phone → 403 only when the setting requires it', async () => {
    const { variant } = await h.shop();
    const unverified = await f.user({ phone_verified: false });
    // Default: no SMS gateway yet, so COD must work for unverified phones.
    await h.placeOrder(unverified.token, variant, { payment_method: 'cod' });

    await h.setSetting('checkout', { cod_enabled: true, cod_requires_verified_phone: true, reservation_minutes: 30, pending_order_limit: 3 });
    await h.checkout(unverified.token, h.checkoutBody(variant, { payment_method: 'cod' })).expect(403);
    await h.placeOrder(unverified.token, variant); // card is fine

    const { token } = await f.user();
    await h.setSetting('checkout', { cod_enabled: false, reservation_minutes: 30, pending_order_limit: 3 });
    const res = await h.checkout(token, h.checkoutBody(variant, { payment_method: 'cod' })).expect(400);
    expect(res.body.message).toMatch(/Cash on delivery/);
  });

  test('online payment needs at least ৳10; COD does not', async () => {
    const { variant } = await h.shop({ price: 500 });
    const { token } = await f.user();
    await h.setSetting('shipping', { zones: [{ code: 'pickup', label: 'Pickup', fee: 0, eta: null, is_default: true }], free_shipping_threshold: null });
    await query(`INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
                 VALUES ('FREE', 'percentage', 100, NOW() - interval '1 day', NOW() + interval '1 day')`);
    await h.checkout(token, h.checkoutBody(variant, { shipping_method: 'pickup', coupon_code: 'FREE' })).expect(400);
    const cod = await h.placeOrder(token, variant, { shipping_method: 'pickup', coupon_code: 'FREE', payment_method: 'cod' });
    expect(cod.total).toBe(0);
  });
});

describe('checkout concurrency', () => {
  test('tied branch stock under contention: only clean wins and "out of stock" losses (fixed lock order)', async () => {
    for (let round = 0; round < 5; round++) {
      await h.reset();
      const brs = await Promise.all([f.branch(), f.branch(), f.branch()]);
      const { variants: [v] } = await f.product({ variants: [{ price: 1000, stock: [
        { branch_id: brs[0].id, quantity: 2 }, { branch_id: brs[1].id, quantity: 1 }, { branch_id: brs[2].id, quantity: 1 },
      ] }] });
      const users = await Promise.all(Array.from({ length: 10 }, () => f.user()));
      const results = await Promise.all(users.map((u) => h.checkout(u.token, h.checkoutBody(v))));
      const outcome = results.map((r) => (r.status === 201 ? '201' : `${r.status} ${r.body.message}`)).sort();
      expect(outcome.filter((o) => o === '201')).toHaveLength(4);
      for (const o of outcome.filter((x) => x !== '201')) expect(o).toMatch(/^409 .* is out of stock$/);
      const { rows } = await query('SELECT quantity, reserved FROM inventory WHERE variant_id = $1', [v.id]);
      expect(rows.every((r) => r.reserved === r.quantity)).toBe(true);
    }
  });

  test('two customers buying the last unit at once → exactly one wins', async () => {
    const { variant, branch } = await h.shop({ quantity: 1 });
    const a = await f.user();
    const b = await f.user();
    const [ra, rb] = await Promise.all([
      h.checkout(a.token, h.checkoutBody(variant)),
      h.checkout(b.token, h.checkoutBody(variant)),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    expect(await h.stock(variant.id, branch.id)).toMatchObject({ quantity: 1, reserved: 1 });
  });

  test('ten customers for three units across two branches → exactly three orders', async () => {
    const b1 = await f.branch();
    const b2 = await f.branch();
    const { variants: [v] } = await f.product({ variants: [{ price: 1000, stock: [{ branch_id: b1.id, quantity: 2 }, { branch_id: b2.id, quantity: 1 }] }] });
    const users = await Promise.all(Array.from({ length: 10 }, () => f.user()));
    const results = await Promise.all(users.map((u) => h.checkout(u.token, h.checkoutBody(v))));
    // Compare the full picture so an unexpected status shows its message.
    const outcome = results.map((r) => (r.status === 201 ? 201 : `${r.status} ${r.body.message}`)).sort();
    expect(outcome).toEqual([...Array(3).fill(201), ...Array(7).fill(`409 ${results.find((r) => r.status === 409)?.body.message}`)]);
    const { rows } = await query('SELECT quantity, reserved FROM inventory WHERE variant_id = $1', [v.id]);
    for (const r of rows) expect(r.reserved).toBeLessThanOrEqual(r.quantity);
    expect(rows.reduce((n, r) => n + r.reserved, 0)).toBe(3);
  });
});
