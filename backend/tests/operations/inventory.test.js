const { api, query, resetDb, factories: f } = require('../helpers');
const {
  world, expectStockInvariants, ledgerSum, expectStaffOnly, auditCount,
} = require('./ops.helpers');

const INV = '/api/v1/inventory';
let w;
let variant;
let rowA;
let rowB;

beforeEach(async () => {
  await resetDb();
  w = await world();
  const { variants } = await f.product({
    name: 'ThinkPad X1 Carbon',
    variants: [{
      sku: 'TP-X1-16-512', price: 95000,
      stock: [{ branch_id: w.branchA.id, quantity: 5, reserved: 1 }, { branch_id: w.branchB.id, quantity: 3 }],
    }],
  });
  [variant] = variants;
  await query('UPDATE product_variants SET cost_price = 70000 WHERE id = $1', [variant.id]);
  rowA = await f.stock(variant.id, w.branchA.id);
  rowB = await f.stock(variant.id, w.branchB.id);
});

afterEach(expectStockInvariants);

const as = (who) => f.auth(who.token);

describe('authz', () => {
  test('every inventory route rejects anonymous (401) and customers (403)', async () => {
    const id = rowA.id;
    await expectStaffOnly([
      ['get', INV],
      ['get', `${INV}/${id}`],
      ['post', INV, { variant_id: variant.id, branch_id: w.branchA.id, quantity: 1 }],
      ['put', `${INV}/${id}`, { quantity: 9 }],
      ['post', `${INV}/${id}/adjust`, { delta: 1, reason: 'received' }],
      ['post', `${INV}/transfer`, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1 }],
      ['get', `${INV}/movements`],
      ['get', `${INV}/units`],
      ['post', `${INV}/units`, { variant_id: variant.id, serial_number: 'X' }],
      ['patch', `${INV}/units/${id}`, { notes: 'x' }],
      ['delete', `${INV}/${id}`],
    ], w.customer.token);
  });

  test('branch_admin of A is blocked from branch B on every branch-scoped endpoint', async () => {
    const t = as(w.adminA);
    await api.get(`${INV}?branch_id=${w.branchB.id}`).set(t).expect(403);
    await api.get(`${INV}/${rowB.id}`).set(t).expect(404);
    await api.post(INV).set(t).send({ variant_id: variant.id, branch_id: w.branchB.id, quantity: 1 }).expect(403);
    await api.put(`${INV}/${rowB.id}`).set(t).send({ quantity: 50 }).expect(404);
    await api.post(`${INV}/${rowB.id}/adjust`).set(t).send({ delta: 5, reason: 'received' }).expect(404);
    await api.post(`${INV}/transfer`).set(t)
      .send({ variant_id: variant.id, from_branch_id: w.branchB.id, to_branch_id: w.branchA.id, quantity: 1 }).expect(403);
    await api.get(`${INV}/movements?branch_id=${w.branchB.id}`).set(t).expect(403);
    await api.get(`${INV}/units?branch_id=${w.branchB.id}`).set(t).expect(403);
    await api.post(`${INV}/units`).set(t).send({ variant_id: variant.id, branch_id: w.branchB.id, serial_number: 'SN-B' }).expect(403);

    const unitB = await api.post(`${INV}/units`).set(as(w.adminB)).send({ variant_id: variant.id, serial_number: 'SN-B1' }).expect(201);
    await api.patch(`${INV}/units/${unitB.body.data.id}`).set(t).send({ notes: 'mine' }).expect(404);

    expect((await f.stock(variant.id, w.branchB.id)).quantity).toBe(4); // only adminB's unit registration
  });

  test('a branch_admin without a branch is refused', async () => {
    const { token } = await f.user({ role: 'branch_admin' });
    await api.get(INV).set(f.auth(token)).expect(403);
  });

  test('DELETE is super_admin only', async () => {
    await api.delete(`${INV}/${rowA.id}`).set(as(w.adminA)).expect(403);
  });
});

describe('GET /inventory', () => {
  test('branch_admin sees only their branch; super_admin sees all with staff fields', async () => {
    const a = await api.get(INV).set(as(w.adminA)).expect(200);
    expect(a.body.data).toHaveLength(1);
    expect(a.body.data[0]).toMatchObject({
      id: rowA.id, branch_id: w.branchA.id, quantity: 5, reserved: 1, available: 4,
      cost_price: '70000.00', sku: 'TP-X1-16-512', product_name: 'ThinkPad X1 Carbon', price: '95000.00',
    });
    const all = await api.get(INV).set(as(w.sa)).expect(200);
    expect(all.body.pagination.total).toBe(2);
    const onlyB = await api.get(`${INV}?branch_id=${w.branchB.id}`).set(as(w.sa)).expect(200);
    expect(onlyB.body.data.map((r) => r.id)).toEqual([rowB.id]);
  });

  test('search (escaped), product filter, low_stock', async () => {
    const t = as(w.sa);
    expect((await api.get(`${INV}?q=tp-x1`).set(t)).body.data).toHaveLength(2);
    expect((await api.get(`${INV}?q=carbon`).set(t)).body.data).toHaveLength(2);
    expect((await api.get(`${INV}?q=%25`).set(t)).body.data).toHaveLength(0);
    expect((await api.get(`${INV}?q=_`).set(t)).body.data).toHaveLength(0);
    expect((await api.get(`${INV}?product_id=${variant.product_id}`).set(t)).body.data).toHaveLength(2);
    // threshold 5: A has 4 available (low), B has 3 (low); raise B's stock.
    await query('UPDATE inventory SET quantity = 20 WHERE id = $1', [rowB.id]);
    const low = await api.get(`${INV}?low_stock=true`).set(t).expect(200);
    expect(low.body.data.map((r) => r.id)).toEqual([rowA.id]);
    expect(low.body.data[0].is_low_stock).toBe(true);
  });

  test('bad / array query params → 400', async () => {
    const t = as(w.sa);
    await api.get(`${INV}?page=1&page=2`).set(t).expect(400);
    await api.get(`${INV}?branch_id[]=${w.branchA.id}`).set(t).expect(400);
    await api.get(`${INV}?q=a&q=b`).set(t).expect(400);
    await api.get(`${INV}?low_stock=maybe`).set(t).expect(400);
    await api.get(`${INV}?limit=1000`).set(t).expect(400);
    await api.get(`${INV}/not-a-uuid`).set(t).expect(400);
  });

  test('GET /:id includes in-stock serial units', async () => {
    await api.post(`${INV}/units`).set(as(w.adminA)).send({ variant_id: variant.id, serial_number: 'PF-123' }).expect(201);
    const res = await api.get(`${INV}/${rowA.id}`).set(as(w.adminA)).expect(200);
    expect(res.body.data.units.map((u) => u.serial_number)).toEqual(['PF-123']);
  });
});

describe('POST /inventory', () => {
  test('creates a row with an initial ledger entry; duplicate → 409', async () => {
    const { variants: [v2] } = await f.product({ variants: [{ price: 1000 }] });
    const res = await api.post(INV).set(as(w.adminA)).send({ variant_id: v2.id, quantity: 7, low_stock_threshold: 2 }).expect(201);
    expect(res.body.data).toMatchObject({ branch_id: w.branchA.id, quantity: 7, reserved: 0, low_stock_threshold: 2 });
    expect(await ledgerSum(v2.id, w.branchA.id)).toBe(7);
    const mv = await query("SELECT movement_type, performed_by FROM stock_movements WHERE variant_id = $1", [v2.id]);
    expect(mv.rows).toEqual([{ movement_type: 'initial', performed_by: w.adminA.user.id }]);
    await api.post(INV).set(as(w.adminA)).send({ variant_id: v2.id, quantity: 1 }).expect(409);
    expect(await auditCount('inventory.create', res.body.data.id)).toBe(1);
  });

  test('validation and branch rules', async () => {
    const { variants: [v2] } = await f.product();
    const t = as(w.sa);
    await api.post(INV).set(t).send({ variant_id: v2.id, quantity: 1 }).expect(400); // super_admin w/o branch
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: w.branchA.id, quantity: -1 }).expect(400);
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: w.branchA.id, quantity: '5' }).expect(400);
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: w.branchA.id, quantity: 1.5 }).expect(400);
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: w.branchA.id, quantity: 1e9 }).expect(400);
    await api.post(INV).set(t).send({ variant_id: [v2.id], branch_id: w.branchA.id, quantity: 1 }).expect(400);
    await api.post(INV).set(t).send({ variant_id: '00000000-0000-4000-8000-000000000000', branch_id: w.branchA.id, quantity: 1 }).expect(400);
    const closed = await f.branch({ is_active: false });
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: closed.id, quantity: 1 }).expect(400);
    await api.post(INV).set(t).send({ variant_id: v2.id, branch_id: w.branchB.id, quantity: 0 }).expect(201);
    expect(await ledgerSum(v2.id, w.branchB.id)).toBe(0);
  });
});

describe('PUT /inventory/:id (stock count)', () => {
  test('sets absolute quantity with an adjustment movement; never below reserved', async () => {
    const res = await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ quantity: 8, note: 'recount' }).expect(200);
    expect(res.body.data).toMatchObject({ quantity: 8, reserved: 1, available: 7 });
    const mv = await query("SELECT quantity_delta, note FROM stock_movements WHERE movement_type = 'adjustment'");
    expect(mv.rows).toEqual([{ quantity_delta: 3, note: 'recount' }]);

    const r = await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ quantity: 0 }).expect(409);
    expect(r.body.message).toMatch(/reserved/);
    await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ quantity: 1 }).expect(200);
  });

  test('threshold only; empty / negative → 400', async () => {
    const res = await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ low_stock_threshold: 1 }).expect(200);
    expect(res.body.data).toMatchObject({ quantity: 5, low_stock_threshold: 1, is_low_stock: false });
    await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ note: 'only a note' }).expect(400);
    await api.put(`${INV}/${rowA.id}`).set(as(w.adminA)).send({ quantity: -3 }).expect(400);
    expect(await ledgerSum(variant.id, w.branchA.id)).toBe(0);
  });
});

describe('POST /inventory/:id/adjust', () => {
  test('relative adjustments write a typed ledger entry', async () => {
    const t = as(w.adminA);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 3, reason: 'received', note: 'PO-77' }).expect(200);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: -1, reason: 'damaged' }).expect(200);
    const res = await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 1, reason: 'returned' }).expect(200);
    expect(res.body.data.quantity).toBe(8);
    const types = (await query('SELECT movement_type FROM stock_movements ORDER BY created_at')).rows.map((r) => r.movement_type);
    expect(types).toEqual(['received', 'damaged', 'return']);
    expect(await ledgerSum(variant.id, w.branchA.id)).toBe(3);
    expect(await auditCount('inventory.adjust', rowA.id)).toBe(3);
  });

  test('cannot go below reserved or zero; delta 0 / bad reason → 400', async () => {
    const t = as(w.adminA);
    const r = await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: -5, reason: 'lost' }).expect(409);
    expect(r.body.message).toMatch(/reserved/);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: -6, reason: 'lost' }).expect(409);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: -4, reason: 'lost' }).expect(200);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 0, reason: 'lost' }).expect(400);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 1, reason: 'stolen' }).expect(400);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 1.5, reason: 'other' }).expect(400);
    await api.post(`${INV}/${rowA.id}/adjust`).set(t).send({ delta: 1, reason: 'other', note: 'x'.repeat(501) }).expect(400);
    expect((await f.stock(variant.id, w.branchA.id))).toMatchObject({ quantity: 1, reserved: 1 });
  });
});

describe('POST /inventory/transfer', () => {
  const transfer = (who, body) => api.post(`${INV}/transfer`).set(as(who)).send(body);

  test('moves available stock, creates the destination row, ledgers both sides', async () => {
    const c = await f.branch({ name: 'Chawkbazar' });
    const res = await transfer(w.adminA, {
      variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: c.id, quantity: 4, note: 'restock',
    }).expect(201);
    expect(res.body.data.from).toMatchObject({ quantity: 1, reserved: 1, available: 0 });
    expect(res.body.data.to).toMatchObject({ branch_id: c.id, quantity: 4 });
    const moves = await query(
      'SELECT movement_type, quantity_delta, reference_id FROM stock_movements ORDER BY quantity_delta'
    );
    expect(moves.rows.map((m) => [m.movement_type, m.quantity_delta])).toEqual([['transfer_out', -4], ['transfer_in', 4]]);
    expect(moves.rows[0].reference_id).toBe(moves.rows[1].reference_id);
    expect(await auditCount('inventory.transfer')).toBe(1);
  });

  test('reserved units cannot be transferred; validation', async () => {
    const r = await transfer(w.adminA, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 5 }).expect(409);
    expect(r.body.message).toMatch(/Only 4/);
    await transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchA.id, quantity: 1 }).expect(400);
    await transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchA.id.toUpperCase(), quantity: 1 }).expect(400);
    await transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 0 }).expect(400);
    await transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: -2 }).expect(400);
    const closed = await f.branch({ is_active: false });
    await transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: closed.id, quantity: 1 }).expect(400);
    const { variants: [none] } = await f.product();
    await transfer(w.sa, { variant_id: none.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1 }).expect(409);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(5);
    expect((await f.stock(none.id, w.branchB.id))).toBeUndefined(); // rolled back
  });

  test('serial units travel with the stock', async () => {
    const u = await api.post(`${INV}/units`).set(as(w.adminA)).send({ variant_id: variant.id, serial_number: 'SN-T1' }).expect(201);
    await transfer(w.adminA, {
      variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1, unit_ids: [u.body.data.id],
    }).expect(201);
    const unit = await query('SELECT branch_id FROM inventory_units WHERE id = $1', [u.body.data.id]);
    expect(unit.rows[0].branch_id).toBe(w.branchB.id);
    // A unit that isn't at the source branch can't be sent from there.
    await transfer(w.adminA, {
      variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1, unit_ids: [u.body.data.id],
    }).expect(409);
    await transfer(w.adminA, {
      variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1,
      unit_ids: [u.body.data.id, u.body.data.id],
    }).expect(400);
  });

  test('concurrent transfers of the same stock: exactly one wins, no negative stock', async () => {
    const c = await f.branch();
    const [r1, r2] = await Promise.all([
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 3 }),
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: c.id, quantity: 3 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const a = await f.stock(variant.id, w.branchA.id);
    expect(a).toMatchObject({ quantity: 2, reserved: 1 });
    const total = await query('SELECT SUM(quantity)::int AS n FROM inventory WHERE variant_id = $1', [variant.id]);
    expect(total.rows[0].n).toBe(8);
  });

  test('opposite transfers at the same time do not deadlock', async () => {
    const results = await Promise.all([
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 2 }),
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchB.id, to_branch_id: w.branchA.id, quantity: 2 }),
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchA.id, to_branch_id: w.branchB.id, quantity: 1 }),
      transfer(w.sa, { variant_id: variant.id, from_branch_id: w.branchB.id, to_branch_id: w.branchA.id, quantity: 1 }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(5);
    expect((await f.stock(variant.id, w.branchB.id)).quantity).toBe(3);
  });
});

describe('GET /inventory/movements', () => {
  test('branch scoped, filterable, shows performer names', async () => {
    await api.post(`${INV}/${rowA.id}/adjust`).set(as(w.adminA)).send({ delta: 2, reason: 'received' }).expect(200);
    await api.post(`${INV}/${rowB.id}/adjust`).set(as(w.adminB)).send({ delta: -1, reason: 'damaged' }).expect(200);

    const a = await api.get(`${INV}/movements`).set(as(w.adminA)).expect(200);
    expect(a.body.data).toHaveLength(1);
    expect(a.body.data[0]).toMatchObject({
      movement_type: 'received', quantity_delta: 2, performed_by_name: 'Alam Admin', branch_name: 'Agrabad', sku: 'TP-X1-16-512',
    });

    const t = as(w.sa);
    expect((await api.get(`${INV}/movements`).set(t)).body.pagination.total).toBe(2);
    expect((await api.get(`${INV}/movements?movement_type=damaged`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${INV}/movements?performer=bashir`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${INV}/movements?performed_by=${w.adminA.user.id}`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${INV}/movements?variant_id=${variant.id}&branch_id=${w.branchB.id}`).set(t)).body.data).toHaveLength(1);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    expect((await api.get(`${INV}/movements?from=${today}&to=${today}`).set(t)).body.data).toHaveLength(2);
    expect((await api.get(`${INV}/movements?to=2001-01-01`).set(t)).body.data).toHaveLength(0);
    await api.get(`${INV}/movements?from=yesterday`).set(t).expect(400);
    await api.get(`${INV}/movements?from=2026-13-45`).set(t).expect(400);
    await api.get(`${INV}/movements?movement_type=sale;drop`).set(t).expect(400);
  });
});

describe('DELETE /inventory/:id', () => {
  test('only an empty row can be deleted', async () => {
    await api.delete(`${INV}/${rowB.id}`).set(as(w.sa)).expect(409);
    await query('UPDATE inventory SET quantity = 0 WHERE id = $1', [rowB.id]);
    await api.delete(`${INV}/${rowB.id}`).set(as(w.sa)).expect(200);
    expect(await f.stock(variant.id, w.branchB.id)).toBeUndefined();
    await api.delete(`${INV}/${rowB.id}`).set(as(w.sa)).expect(404);
  });
});

describe('serial registry', () => {
  const register = (who, body) => api.post(`${INV}/units`).set(as(who)).send({ variant_id: variant.id, ...body });

  test('registering a unit adds one to stock (creating the row) with a received movement', async () => {
    const c = await f.branch();
    const res = await register(w.sa, {
      branch_id: c.id, serial_number: 'PF-2XK9', condition_grade: 'A', battery_health: 87,
      cosmetic_notes: 'Light scratch on lid', cost_price: 60000, listed_price: 89000,
    }).expect(201);
    expect(res.body.data).toMatchObject({ status: 'in_stock', serial_number: 'PF-2XK9', battery_health: 87, branch_id: c.id });
    expect((await f.stock(variant.id, c.id)).quantity).toBe(1);
    const mv = await query('SELECT movement_type, quantity_delta, unit_id FROM stock_movements');
    expect(mv.rows).toEqual([{ movement_type: 'received', quantity_delta: 1, unit_id: res.body.data.id }]);
    expect(await auditCount('inventory.unit_create', res.body.data.id)).toBe(1);
  });

  test('serial is unique per variant (case-insensitive); validation', async () => {
    await register(w.adminA, { serial_number: 'ABC-1' }).expect(201);
    await register(w.adminA, { serial_number: 'abc-1' }).expect(409);
    await register(w.adminB, { serial_number: 'ABC-1' }).expect(409);
    const { variants: [other] } = await f.product();
    await api.post(`${INV}/units`).set(as(w.adminA)).send({ variant_id: other.id, serial_number: 'ABC-1' }).expect(201);

    await register(w.adminA, { serial_number: 'N1', battery_health: 101 }).expect(400);
    await register(w.adminA, { serial_number: 'N1', battery_health: -1 }).expect(400);
    await register(w.adminA, { serial_number: 'N1', cost_price: -5 }).expect(400);
    await register(w.adminA, { serial_number: '' }).expect(400);
    await register(w.adminA, { serial_number: 'x'.repeat(121) }).expect(400);
    await register(w.adminA, { serial_number: ['a'] }).expect(400);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(6);
  });

  test('concurrent registration of the same serial: one wins', async () => {
    const [r1, r2] = await Promise.all([
      register(w.adminA, { serial_number: 'DUP-1' }),
      register(w.adminA, { serial_number: 'DUP-1' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(6);
  });

  test('list is branch scoped and filterable', async () => {
    await register(w.adminA, { serial_number: 'A-1' }).expect(201);
    await register(w.adminB, { serial_number: 'B-1' }).expect(201);
    const a = await api.get(`${INV}/units`).set(as(w.adminA)).expect(200);
    expect(a.body.data.map((u) => u.serial_number)).toEqual(['A-1']);
    expect(a.body.data[0]).toHaveProperty('cost_price');
    expect((await api.get(`${INV}/units?q=b-`).set(as(w.sa))).body.data).toHaveLength(1);
    expect((await api.get(`${INV}/units?status=sold`).set(as(w.sa))).body.data).toHaveLength(0);
    await api.get(`${INV}/units?status=lost`).set(as(w.sa)).expect(400);
  });

  test('write-off removes one unit of stock, guarded by reserved; un-writing-off never adds stock back', async () => {
    const u = await register(w.adminA, { serial_number: 'WO-1' }).expect(201); // A: qty 6, reserved 1
    const id = u.body.data.id;
    const res = await api.patch(`${INV}/units/${id}`).set(as(w.adminA)).send({ status: 'written_off', note: 'Water damage' }).expect(200);
    expect(res.body.data.status).toBe('written_off');
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(5);
    await api.patch(`${INV}/units/${id}`).set(as(w.adminA)).send({ status: 'in_stock' }).expect(200);
    // Bookkeeping only — stock comes back via an explicit adjust (audited).
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(5);
    await api.post(`${INV}/${rowA.id}/adjust`).set(as(w.adminA)).send({ delta: 1, reason: 'correction', note: 'Write-off undone' }).expect(200);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(6);

    // Everything else reserved → write-off would eat a reserved unit.
    await query('UPDATE inventory SET reserved = 6 WHERE id = $1', [rowA.id]);
    const r = await api.patch(`${INV}/units/${id}`).set(as(w.adminA)).send({ status: 'written_off' }).expect(409);
    expect(r.body.message).toMatch(/reserved/);
    expect((await query('SELECT status FROM inventory_units WHERE id = $1', [id])).rows[0].status).toBe('in_stock');
  });

  test('status transitions are restricted; details editable; serial uniqueness on edit', async () => {
    const u1 = (await register(w.adminA, { serial_number: 'S-1' })).body.data.id;
    await register(w.adminA, { serial_number: 'S-2' }).expect(201);
    const t = as(w.adminA);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'returned' }).expect(409);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'reserved' }).expect(400);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ serial_number: 's-2' }).expect(409);
    await api.patch(`${INV}/units/${u1}`).set(t).send({}).expect(400);
    const edit = await api.patch(`${INV}/units/${u1}`).set(t)
      .send({ battery_health: 80, cosmetic_notes: null, listed_price: 85000, variant_id: '00000000-0000-4000-8000-000000000000' }).expect(200);
    expect(edit.body.data).toMatchObject({ battery_health: 80, cosmetic_notes: null, listed_price: '85000.00', variant_id: variant.id });

    // in_stock → sold is bookkeeping only (the sale elsewhere moved the stock).
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'sold' }).expect(200);
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(7);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'in_stock' }).expect(409);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'returned' }).expect(200);
    await api.patch(`${INV}/units/${u1}`).set(t).send({ status: 'in_stock' }).expect(200);
    // Unit status changes never raise stock (restocking is an explicit adjust).
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(7);
    await api.patch(`${INV}/units/00000000-0000-4000-8000-000000000000`).set(t).send({ notes: 'x' }).expect(404);
  });

  test('cycling a unit through statuses cannot mint stock (review finding)', async () => {
    const u = (await register(w.adminA, { serial_number: 'CYCLE-1' })).body.data.id;
    const t = as(w.adminA);
    const start = (await f.stock(variant.id, w.branchA.id)).quantity;
    for (let i = 0; i < 3; i++) {
      await api.patch(`${INV}/units/${u}`).set(t).send({ status: 'sold' }).expect(200);
      await api.patch(`${INV}/units/${u}`).set(t).send({ status: 'returned' }).expect(200);
      await api.patch(`${INV}/units/${u}`).set(t).send({ status: 'in_stock' }).expect(200);
    }
    expect((await f.stock(variant.id, w.branchA.id)).quantity).toBe(start);
  });
});
