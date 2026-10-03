const { api, query, resetDb, factories: f } = require('../helpers');
const { actors, stocked, past, future } = require('./_p3');

beforeEach(resetDb);

const P = '/api/v1/products';
const history = (id, who) => api.get(`${P}/admin/${id}/price-history`).set(who || {});

describe('branch admins may change every price, cost included', () => {
  test('price, compare_at, sale and cost fields: staff OK and audited with before/after', async () => {
    const a = await actors();
    const { variant } = await stocked({ price: 50000, compare_at_price: 60000 });
    const url = `${P}/variants/${variant.id}`;

    await api.put(url).set(a.cust).send({ price: 1 }).expect(403);
    const r = await api.put(url).set(a.ba).send({
      price: 52000, compare_at_price: 58000, sale_price: 49000, sale_starts_at: past(1), sale_ends_at: future(3),
    }).expect(200);
    expect(r.body.data).toMatchObject({ price: '52000.00', compare_at_price: '58000.00', sale_price: '49000.00', effective_price: '49000.00' });

    await api.put(url).set(a.ba).send({ cost_price: 100 }).expect(200);
    await api.put(url).set(a.ba).send({ price: 52000, variant_name: 'Same price resent' }).expect(200);
    await api.put(url).set(a.sa).send({ cost_price: 200 }).expect(200);

    const { rows } = await query("SELECT actor_id, data FROM admin_audit_log WHERE action = 'variant.update' ORDER BY created_at");
    expect(rows[0].actor_id).toBe(a.users.ba.id);
    expect(rows[0].data.before).toMatchObject({ price: '50000.00', compare_at_price: '60000.00' });
    expect(rows[0].data.after).toMatchObject({ price: 52000, compare_at_price: 58000, sale_price: 49000 });
  });
});

describe('GET /products/admin/:id/price-history', () => {
  const setup = async () => {
    const a = await actors();
    const { product, variant } = await stocked({ price: 50000 });
    const url = `${P}/variants/${variant.id}`;
    await api.put(url).set(a.ba).send({ price: 48000 }).expect(200);
    await api.put(url).set(a.sa).send({ price: 47000, cost_price: 30000 }).expect(200);
    await api.put(url).set(a.sa).send({ cost_price: 31000 }).expect(200); // cost only
    await api.put(url).set(a.ba).send({ variant_name: 'Renamed' }).expect(200); // no price field
    return { a, product, variant };
  };

  test('authz: anonymous 401, customer 403, staff and super admin OK; unknown product 404; bad id 400', async () => {
    const { a, product } = await setup();
    await history(product.id).expect(401);
    await history(product.id, a.cust).expect(403);
    await history(product.id, a.ba).expect(200);
    await history(product.id, a.sa).expect(200);
    await history('11111111-1111-4111-8111-111111111111', a.sa).expect(404);
    await history('nope', a.sa).expect(400);
  });

  test('super admin sees every price field, newest first, with actor and variant info', async () => {
    const { a, product, variant } = await setup();
    const res = await history(product.id, a.sa).expect(200);
    expect(res.body.data).toHaveLength(3);
    const [cost, mixed, first] = res.body.data;
    expect(cost).toEqual({
      at: expect.any(String),
      actor: { id: a.users.sa.id, full_name: a.users.sa.full_name, role: 'super_admin' },
      variant_id: variant.id,
      sku: variant.sku,
      variant_name: 'Renamed',
      changes: [{ field: 'cost_price', from: 30000, to: 31000 }],
    });
    expect(mixed.changes).toEqual([
      { field: 'price', from: 48000, to: 47000 },
      { field: 'cost_price', from: null, to: 30000 },
    ]);
    expect(first.actor.role).toBe('branch_admin');
    expect(first.changes).toEqual([{ field: 'price', from: 50000, to: 48000 }]);
    expect(new Date(cost.at) >= new Date(mixed.at)).toBe(true);
  });

  test('branch staff see the same history as a super admin, cost changes included', async () => {
    const { a, product } = await setup();
    const staff = (await history(product.id, a.ba).expect(200)).body.data;
    const owner = (await history(product.id, a.sa).expect(200)).body.data;
    expect(staff).toEqual(owner);
    expect(staff[0].changes).toEqual([{ field: 'cost_price', from: 30000, to: 31000 }]);
  });

  test('variant.create counts every price field as a change from null', async () => {
    const a = await actors();
    const { product } = await stocked();
    await api.post(`${P}/${product.id}/variants`).set(a.sa).send({
      sku: 'NEW-1', variant_name: '16GB', price: 70000, compare_at_price: 75000, cost_price: 50000,
    }).expect(201);
    const sa = (await history(product.id, a.sa).expect(200)).body.data;
    expect(sa).toHaveLength(1);
    expect(sa[0]).toMatchObject({ sku: 'NEW-1', variant_name: '16GB' });
    expect(sa[0].changes).toEqual([
      { field: 'price', from: null, to: 70000 },
      { field: 'compare_at_price', from: null, to: 75000 },
      { field: 'cost_price', from: null, to: 50000 },
    ]);
    const ba = (await history(product.id, a.ba).expect(200)).body.data;
    expect(ba[0].changes.map((c) => c.field)).toEqual(['price', 'compare_at_price', 'cost_price']);
  });

  test("another product's variants never leak in; capped at 100 rows", async () => {
    const a = await actors();
    const one = await stocked();
    const two = await stocked();
    await api.put(`${P}/variants/${two.variant.id}`).set(a.sa).send({ price: 1111 }).expect(200);
    expect((await history(one.product.id, a.sa).expect(200)).body.data).toEqual([]);

    const rows = Array.from({ length: 120 }, (_, i) => [one.variant.id, one.product.id, i]);
    for (const [vid, pid, i] of rows) {
      await query(
        `INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, data) VALUES ($1, 'variant.update', 'variant', $2, $3)`,
        [a.users.sa.id, vid, JSON.stringify({ product_id: pid, before: { price: 100 + i }, after: { price: 101 + i } })]
      );
    }
    expect((await history(one.product.id, a.sa).expect(200)).body.data).toHaveLength(100);
  });
});

describe('GET /audit-log (super admin)', () => {
  const log = (qs = '', who) => api.get(`/api/v1/audit-log${qs}`).set(who || {});
  const insert = (actor, action, entity, entityId, createdAt, data = { x: 1 }) =>
    query(
      `INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, data, ip, created_at) VALUES ($1, $2, $3, $4, $5, '10.0.0.1', $6)`,
      [actor?.id || null, action, entity, entityId, JSON.stringify(data), createdAt]
    );

  test('authz: anonymous 401, customer 403, branch admin 403, super admin OK (also /actions)', async () => {
    const a = await actors();
    for (const url of ['', '/actions']) {
      await log(url).expect(401);
      await log(url, a.cust).expect(403);
      await log(url, a.ba).expect(403);
      await log(url, a.sa).expect(200);
    }
  });

  test('shape: newest first, actor object (null when unknown), data and ip, pagination', async () => {
    const a = await actors();
    const id = '22222222-2222-4222-8222-222222222222';
    await insert(a.users.ba, 'variant.update', 'variant', id, past(2));
    await insert(null, 'system.cleanup', 'order', null, past(1));
    const res = await log('', a.sa).expect(200);
    expect(res.body.data).toEqual([
      { id: expect.any(String), at: expect.any(String), actor: null, action: 'system.cleanup', entity: 'order', entity_id: null, data: { x: 1 }, ip: '10.0.0.1' },
      { id: expect.any(String), at: expect.any(String), actor: { id: a.users.ba.id, full_name: a.users.ba.full_name, role: 'branch_admin' }, action: 'variant.update', entity: 'variant', entity_id: id, data: { x: 1 }, ip: '10.0.0.1' },
    ]);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 2 });
  });

  test('filters: actor_id, action prefix, entity, entity_id, from / to, combined, pagination', async () => {
    const a = await actors();
    const v1 = '33333333-3333-4333-8333-333333333333';
    const v2 = '44444444-4444-4444-8444-444444444444';
    await insert(a.users.ba, 'variant.update', 'variant', v1, '2026-03-01T10:00:00Z');
    await insert(a.users.sa, 'variant.create', 'variant', v2, '2026-03-02T10:00:00Z');
    await insert(a.users.sa, 'order.status', 'order', v1, '2026-03-03T10:00:00Z');
    await insert(a.users.sa, 'order.reconcile', 'order', v2, '2026-03-04T10:00:00Z');
    const actions = async (qs) => (await log(qs, a.sa).expect(200)).body.data.map((r) => r.action);

    expect(await actions(`?actor_id=${a.users.ba.id}`)).toEqual(['variant.update']);
    expect(await actions('?action=variant.')).toEqual(['variant.create', 'variant.update']);
    expect(await actions('?action=order.')).toEqual(['order.reconcile', 'order.status']);
    expect(await actions('?action=order.status')).toEqual(['order.status']);
    expect(await actions('?action=orde_.')).toEqual([]); // LIKE wildcards are literal
    await log('?action=%25', a.sa).expect(400);
    expect(await actions('?entity=variant')).toEqual(['variant.create', 'variant.update']);
    expect(await actions(`?entity_id=${v1}`)).toEqual(['order.status', 'variant.update']);
    expect(await actions('?from=2026-03-02&to=2026-03-03')).toEqual(['order.status', 'variant.create']); // date-only `to` includes that day
    expect(await actions('?from=2026-03-03T12:00:00Z')).toEqual(['order.reconcile']);
    expect(await actions('?to=2026-03-01T10:00:00Z')).toEqual(['variant.update']);
    expect(await actions(`?actor_id=${a.users.sa.id}&action=order.&entity_id=${v2}`)).toEqual(['order.reconcile']);
    expect(await actions('?actor_id=&action=')).toHaveLength(4); // blank filters are ignored

    const page = await log('?limit=2&page=2', a.sa).expect(200);
    expect(page.body.data.map((r) => r.action)).toEqual(['variant.create', 'variant.update']);
    expect(page.body.pagination).toMatchObject({ total: 4, totalPages: 2, hasPrev: true, hasNext: false });
  });

  test('validation: limit over 100, bad ids / dates / action, arrays are 400', async () => {
    const a = await actors();
    for (const qs of [
      '?limit=101', '?page=0', '?actor_id=nope', '?entity_id=nope', '?from=yesterday', '?to=2026-13-45',
      '?action=a%20b', `?action=${'x'.repeat(61)}`, '?action=a&action=b', '?page=1&page=2', '?from=2026-01-01&from=2026-01-02',
    ]) {
      const res = await log(qs, a.sa);
      expect([qs, res.status]).toEqual([qs, 400]);
    }
  });

  test('GET /audit-log/actions: distinct names, sorted', async () => {
    const a = await actors();
    await insert(a.users.sa, 'variant.update', 'variant', null, past(1));
    await insert(a.users.sa, 'variant.update', 'variant', null, past(2));
    await insert(a.users.sa, 'banner.create', 'banner', null, past(3));
    expect((await log('/actions', a.sa).expect(200)).body.data).toEqual(['banner.create', 'variant.update']);
  });
});

describe('GET /payments/orders/:orderId/reconcile', () => {
  test('is super admin only (branch admins 403, even before the order lookup)', async () => {
    const a = await actors();
    const url = '/api/v1/payments/orders/11111111-1111-4111-8111-111111111111/reconcile';
    await api.get(url).expect(401);
    await api.get(url).set(a.cust).expect(403);
    await api.get(url).set(a.ba).expect(403);
    await api.get(url).set(a.sa).expect(404);
  });
});
