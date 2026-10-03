const { api, query, resetDb, factories: f } = require('../helpers');
const { world, expectStaffOnly, auditCount } = require('./ops.helpers');

const R = '/api/v1/repairs';
let w;
let service;

beforeEach(async () => {
  await resetDb();
  w = await world();
  const { rows } = await query(
    `INSERT INTO repair_services (name, slug, description, base_price)
     VALUES ('Screen Replacement', 'screen-replacement', 'Genuine parts', 3500) RETURNING *`
  );
  [service] = rows;
});

const as = (who) => f.auth(who.token);

const booking = (overrides = {}) => ({
  customer_name: 'Sadia Rahman',
  customer_phone: '01711222333',
  customer_email: 'sadia@example.com',
  device_type: 'Laptop',
  device_brand: 'Dell',
  device_model: 'XPS 15',
  device_serial: 'SN-SECRET-99',
  issue_description: 'Screen flickers and goes black after a few minutes.',
  service_id: service.id,
  ...overrides,
});

/** Staff walk-in ticket at branch A (internal notes set). */
const walkIn = async (who = w.adminA, overrides = {}) =>
  (await api.post(`${R}/tickets/walk-in`).set(as(who))
    .send(booking({ internal_notes: 'Customer was rude; check for liquid damage', ...overrides })).expect(201)).body.data;

describe('POST /repairs/tickets (public booking)', () => {
  test('returns only a receipt; status/costs/notes in the body are ignored', async () => {
    const res = await api.post(`${R}/tickets`).send(booking({
      branch_id: w.branchB.id, status: 'delivered', estimated_cost: 1, final_cost: 1,
      internal_notes: 'pwned', diagnosis_notes: 'x', customer_notes: 'x', priority: 'urgent', customer_id: w.sa.user.id,
    })).expect(201);
    expect(res.body.data).toEqual({
      ticket_number: expect.stringMatching(/^RPR-\d{8}-\d{6}$/),
      status: 'pending',
      branch: { name: 'GEC Circle', phone: w.branchB.phone },
    });
    const t = (await query('SELECT * FROM repair_tickets')).rows[0];
    expect(t).toMatchObject({
      status: 'pending', priority: 'medium', estimated_cost: null, final_cost: null, internal_notes: null,
      diagnosis_notes: null, customer_notes: null, customer_id: null, branch_id: w.branchB.id,
    });
  });

  test('defaults to the first active branch by sort_order; logged-in user becomes the customer', async () => {
    await query('UPDATE branches SET sort_order = 5 WHERE id = $1', [w.branchA.id]);
    await query('UPDATE branches SET sort_order = 1 WHERE id = $1', [w.branchB.id]);
    const res = await api.post(`${R}/tickets`).set(as(w.customer))
      .send(booking({ customer_phone: '+880 1711-222333' })).expect(201);
    expect(res.body.data.branch.name).toBe('GEC Circle');
    const t = (await query('SELECT customer_id, customer_phone FROM repair_tickets')).rows[0];
    expect(t).toEqual({ customer_id: w.customer.user.id, customer_phone: '01711222333' });
  });

  test('validation: phone, lengths, inactive branch/service, arrays', async () => {
    const closed = await f.branch({ is_active: false });
    const { rows: [old] } = await query(
      "INSERT INTO repair_services (name, slug, is_active) VALUES ('Old', 'old', FALSE) RETURNING id"
    );
    const bad = [
      booking({ customer_phone: '12345' }),
      booking({ issue_description: 'short' }),
      booking({ issue_description: 'x'.repeat(2001) }),
      booking({ customer_name: ['a', 'b'] }),
      booking({ customer_email: 'not-an-email' }),
      booking({ branch_id: 'nope' }),
      booking({ branch_id: closed.id }),
      booking({ service_id: old.id }),
      booking({ device_type: '' }),
    ];
    for (const body of bad) await api.post(`${R}/tickets`).send(body).expect(400);
    expect((await query('SELECT COUNT(*)::int AS n FROM repair_tickets')).rows[0].n).toBe(0);
  });

  test('an invalid token is rejected rather than silently ignored', async () => {
    await api.post(`${R}/tickets`).set('Authorization', 'Bearer junk').send(booking()).expect(401);
  });
});

describe('GET /repairs/track (public)', () => {
  test('returns an allowlist only — no internal notes, serial, email or technician contact', async () => {
    const t = await walkIn(w.adminA, {
      assigned_technician: 'Rahim', estimated_cost: 4000, diagnosis_notes: 'Panel cable loose', customer_notes: 'Ready Thursday',
    });
    await api.post(`${R}/tickets/${t.id}/payments`).set(as(w.adminA)).send({ amount: 1000, payment_method: 'bkash' }).expect(201);
    await api.put(`${R}/tickets/${t.id}`).set(as(w.adminA)).send({ final_cost: 3800 }).expect(200);

    const res = await api.get(`${R}/track?ticket_number=${t.ticket_number}&phone=01711222333`).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/rude|liquid damage|SN-SECRET|sadia@example|internal_notes|customer_email|device_serial|customer_phone|priority/);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'assigned_technician', 'balance_due', 'branch_name', 'branch_phone', 'completed_at', 'customer_name',
      'customer_notes', 'delivered_at', 'device_brand', 'device_model', 'device_type', 'diagnosis_notes',
      'estimated_completion', 'estimated_cost', 'final_cost', 'issue_description', 'paid_total', 'received_at',
      'service_name', 'status', 'ticket_number',
    ]);
    expect(res.body.data).toMatchObject({
      status: 'pending', customer_notes: 'Ready Thursday', service_name: 'Screen Replacement',
      branch_name: 'Agrabad', paid_total: 1000, balance_due: 2800,
    });
  });

  test('same 404 for a wrong ticket and a wrong phone; phone formats and case are normalized', async () => {
    const t = await walkIn();
    await query("UPDATE repair_tickets SET customer_phone = '+880 1711-222333' WHERE id = $1", [t.id]);

    const wrongPhone = await api.get(`${R}/track?ticket_number=${t.ticket_number}&phone=01711222334`).expect(404);
    const wrongTicket = await api.get(`${R}/track?ticket_number=RPR-20990101-999999&phone=01711222333`).expect(404);
    expect(wrongPhone.body).toEqual(wrongTicket.body);

    await api.get(`${R}/track?ticket_number=${t.ticket_number.toLowerCase()}&phone=%2B8801711222333`).expect(200);
    await api.get(`${R}/track?ticket_number=${t.ticket_number}`).expect(400);
    await api.get(`${R}/track?ticket_number=${t.ticket_number}&phone=abc`).expect(400);
    await api.get(`${R}/track?ticket_number=a&ticket_number=b&phone=01711222333`).expect(400);
  });

  test('is rate limited', async () => {
    const old = process.env.TEST_RATE_LIMIT;
    process.env.TEST_RATE_LIMIT = '1';
    try {
      let last;
      for (let i = 0; i < 61; i++) {
        last = await api.get(`${R}/track?ticket_number=RPR-X&phone=01711222333`).set('X-Forwarded-For', '10.9.9.9');
      }
      expect(last.status).toBe(429);
    } finally {
      process.env.TEST_RATE_LIMIT = old;
    }
  });
});

describe('staff tickets', () => {
  test('authz: anonymous 401, customer 403 on every staff route', async () => {
    const t = await walkIn();
    await expectStaffOnly([
      ['post', `${R}/tickets/walk-in`, booking()],
      ['get', `${R}/tickets`],
      ['get', `${R}/tickets/${t.id}`],
      ['put', `${R}/tickets/${t.id}`, { status: 'repairing' }],
      ['post', `${R}/tickets/${t.id}/payments`, { amount: 100, payment_method: 'cash' }],
      ['get', `${R}/services/admin`],
    ], w.customer.token);
  });

  test('branch_admin of A is blocked from branch B tickets', async () => {
    const tB = await walkIn(w.adminB);
    const t = as(w.adminA);
    await api.post(`${R}/tickets/walk-in`).set(t).send(booking({ branch_id: w.branchB.id })).expect(403);
    await api.get(`${R}/tickets?branch_id=${w.branchB.id}`).set(t).expect(403);
    await api.get(`${R}/tickets/${tB.id}`).set(t).expect(404);
    await api.put(`${R}/tickets/${tB.id}`).set(t).send({ status: 'cancelled' }).expect(404);
    await api.post(`${R}/tickets/${tB.id}/payments`).set(t).send({ amount: 100, payment_method: 'cash' }).expect(404);
    expect((await api.get(`${R}/tickets`).set(t)).body.data).toHaveLength(0);
    expect((await query('SELECT status FROM repair_tickets WHERE id = $1', [tB.id])).rows[0].status).toBe('pending');
  });

  test('walk-in: own branch by default, triage fields, links a registered customer by phone', async () => {
    const t = await walkIn(w.adminA, {
      customer_phone: w.customer.user.phone, priority: 'urgent', assigned_technician: 'Rahim', estimated_cost: 2500,
    });
    expect(t).toMatchObject({
      branch_id: w.branchA.id, priority: 'urgent', assigned_technician: 'Rahim', estimated_cost: '2500.00',
      customer_id: w.customer.user.id, internal_notes: expect.stringMatching(/rude/), payments: [], paid_total: 0, balance_due: null,
    });
    expect(await auditCount('repair.create', t.id)).toBe(1);
    // super_admin without a branch → first active branch.
    const s = await walkIn(w.sa);
    expect(s.branch_id).toBeDefined();
    await api.post(`${R}/tickets/walk-in`).set(as(w.adminA)).send(booking({ estimated_cost: -1 })).expect(400);
    await api.post(`${R}/tickets/walk-in`).set(as(w.adminA)).send(booking({ priority: 'asap' })).expect(400);
  });

  test('list: parameterized filters and search', async () => {
    const t1 = await walkIn(w.adminA, { customer_name: 'Nadia Islam', customer_phone: '01900444555' });
    await walkIn(w.adminA, { priority: 'high' });
    await walkIn(w.adminB);
    await api.put(`${R}/tickets/${t1.id}`).set(as(w.adminA)).send({ status: 'repairing' }).expect(200);

    const t = as(w.sa);
    expect((await api.get(`${R}/tickets`).set(t)).body.pagination.total).toBe(3);
    expect((await api.get(`${R}/tickets`).set(as(w.adminA))).body.pagination.total).toBe(2);
    expect((await api.get(`${R}/tickets?status=repairing`).set(t)).body.data.map((x) => x.id)).toEqual([t1.id]);
    expect((await api.get(`${R}/tickets?priority=high`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${R}/tickets?q=nadia`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${R}/tickets?q=0190044`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${R}/tickets?q=${t1.ticket_number}`).set(t)).body.data).toHaveLength(1);
    expect((await api.get(`${R}/tickets?q=%25`).set(t)).body.data).toHaveLength(0);
    expect((await api.get(`${R}/tickets?q=${encodeURIComponent("' OR 1=1 --")}`).set(t)).body.data).toHaveLength(0);
    expect((await api.get(`${R}/tickets?branch_id=${w.branchB.id}`).set(t)).body.data).toHaveLength(1);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    expect((await api.get(`${R}/tickets?from=${today}`).set(t)).body.data).toHaveLength(3);
    await api.get(`${R}/tickets?status=done`).set(t).expect(400);
    await api.get(`${R}/tickets?status=pending&status=ready`).set(t).expect(400);
    await api.get(`${R}/tickets?branch_id=${encodeURIComponent("x' OR '1'='1")}`).set(t).expect(400);
  });

  test('update: Zod validated, null clears, status drives timestamps, audited', async () => {
    const t = await walkIn(w.adminA, { assigned_technician: 'Rahim' });
    const u = as(w.adminA);
    const bad = [{}, { status: 'done' }, { estimated_cost: -5 }, { final_cost: '100' }, { internal_notes: 'x'.repeat(5001) },
      { estimated_completion: 'tomorrow' }, { priority: ['high'] }];
    for (const body of bad) await api.put(`${R}/tickets/${t.id}`).set(u).send(body).expect(400);

    let res = await api.put(`${R}/tickets/${t.id}`).set(u).send({ assigned_technician: null, status: 'ready', final_cost: 3000 }).expect(200);
    expect(res.body.data).toMatchObject({ assigned_technician: null, status: 'ready', final_cost: '3000.00', delivered_at: null });
    expect(res.body.data.completed_at).not.toBeNull();

    res = await api.put(`${R}/tickets/${t.id}`).set(u).send({ status: 'delivered' }).expect(200);
    expect(res.body.data.delivered_at).not.toBeNull();
    res = await api.put(`${R}/tickets/${t.id}`).set(u).send({ status: 'repairing' }).expect(200);
    expect(res.body.data).toMatchObject({ completed_at: null, delivered_at: null });
    await api.put(`${R}/tickets/${t.id}`).set(u).send({ status: 'cancelled' }).expect(200);
    await api.put(`${R}/tickets/${t.id}`).set(u).send({ service_id: '00000000-0000-4000-8000-000000000000' }).expect(400);
    expect(await auditCount('repair.update', t.id)).toBe(4);
  });

  test('payments: completed rows, never above final_cost; detail shows balance', async () => {
    const t = await walkIn();
    const u = as(w.adminA);
    for (const body of [{ amount: 0, payment_method: 'cash' }, { amount: -10, payment_method: 'cash' },
      { amount: 100, payment_method: 'cheque' }, { amount: '100', payment_method: 'cash' }, { amount: 100.001, payment_method: 'cash' }]) {
      await api.post(`${R}/tickets/${t.id}/payments`).set(u).send(body).expect(400);
    }
    // Advance before final cost is known.
    await api.post(`${R}/tickets/${t.id}/payments`).set(u).send({ amount: 1500, payment_method: 'cash', notes: 'advance' }).expect(201);
    await api.put(`${R}/tickets/${t.id}`).set(u).send({ final_cost: 1000 }).expect(409); // below what was paid
    await api.put(`${R}/tickets/${t.id}`).set(u).send({ final_cost: 4000 }).expect(200);
    await api.post(`${R}/tickets/${t.id}/payments`).set(u).send({ amount: 2500.01, payment_method: 'card' }).expect(409);
    const pay = await api.post(`${R}/tickets/${t.id}/payments`).set(u).send({ amount: 2500, payment_method: 'nagad' }).expect(201);
    expect(pay.body.data).toMatchObject({ paid_total: 4000, balance_due: 0, payment: { payment_status: 'completed', recorded_by: w.adminA.user.id } });
    await api.post(`${R}/tickets/${t.id}/payments`).set(u).send({ amount: 1, payment_method: 'cash' }).expect(409);

    const detail = await api.get(`${R}/tickets/${t.id}`).set(u).expect(200);
    expect(detail.body.data.payments).toHaveLength(2);
    expect(detail.body.data).toMatchObject({ paid_total: 4000, balance_due: 0 });
    expect(detail.body.data.payments[0].recorded_by_name).toBe('Alam Admin');
    expect(await auditCount('repair.payment', t.id)).toBe(2);
  });

  test('concurrent payments cannot overshoot final_cost', async () => {
    const t = await walkIn();
    await api.put(`${R}/tickets/${t.id}`).set(as(w.adminA)).send({ final_cost: 1000 }).expect(200);
    const results = await Promise.all([1, 2, 3].map(() =>
      api.post(`${R}/tickets/${t.id}/payments`).set(as(w.adminA)).send({ amount: 600, payment_method: 'cash' })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });
});

describe('repair services price list', () => {
  test('public shape unchanged; inactive hidden', async () => {
    await query("INSERT INTO repair_services (name, slug, is_active) VALUES ('Hidden', 'hidden', FALSE)");
    const res = await api.get(`${R}/services`).expect(200);
    expect(res.body.data).toEqual([{
      id: service.id, name: 'Screen Replacement', slug: 'screen-replacement', description: 'Genuine parts', base_price: '3500.00',
    }]);
  });

  test('staff list; super_admin-only writes; slug auto; delete deactivates when in use', async () => {
    const admin = await api.get(`${R}/services/admin`).set(as(w.adminA)).expect(200);
    expect(admin.body.data[0]).toMatchObject({ id: service.id, is_active: true, ticket_count: 0 });

    const body = { name: 'Screen Replacement', base_price: 4000 };
    await api.post(`${R}/services`).set(as(w.adminA)).send(body).expect(403);
    await api.put(`${R}/services/${service.id}`).set(as(w.adminA)).send({ base_price: 1 }).expect(403);
    await api.delete(`${R}/services/${service.id}`).set(as(w.adminA)).expect(403);

    const created = await api.post(`${R}/services`).set(as(w.sa)).send(body).expect(201);
    expect(created.body.data.slug).toBe('screen-replacement-2');
    await api.post(`${R}/services`).set(as(w.sa)).send({ name: 'X', base_price: -1 }).expect(400);
    await api.post(`${R}/services`).set(as(w.sa)).send({ name: 'Keyboard', slug: 'screen-replacement' }).expect(409);
    const upd = await api.put(`${R}/services/${created.body.data.id}`).set(as(w.sa)).send({ base_price: null, description: 'OEM' }).expect(200);
    expect(upd.body.data).toMatchObject({ base_price: null, description: 'OEM' });

    const unused = await api.delete(`${R}/services/${created.body.data.id}`).set(as(w.sa)).expect(200);
    expect(unused.body.data).toEqual({ deleted: true, deactivated: false });

    await walkIn(); // references `service`
    const used = await api.delete(`${R}/services/${service.id}`).set(as(w.sa)).expect(200);
    expect(used.body.data).toEqual({ deleted: false, deactivated: true });
    expect((await api.get(`${R}/services`)).body.data).toHaveLength(0);
    expect(await auditCount('repair_service.deactivate', service.id)).toBe(1);
  });
});
