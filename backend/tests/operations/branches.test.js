const { api, query, resetDb, factories: f } = require('../helpers');
const { world, auditCount } = require('./ops.helpers');

beforeEach(resetDb);

const PUBLIC_KEYS = ['address', 'email', 'id', 'lat', 'lng', 'map_url', 'name', 'opening_hours', 'phone', 'slug', 'whatsapp'];

describe('public branch endpoints', () => {
  test('lists active branches only, in sort order, with public fields only', async () => {
    const second = await f.branch({ name: 'Second' });
    const first = await f.branch({ name: 'First' });
    await f.branch({ name: 'Closed', is_active: false });
    await query('UPDATE branches SET sort_order = 2 WHERE id = $1', [second.id]);
    await query('UPDATE branches SET sort_order = 1, lat = 22.33, lng = 91.83 WHERE id = $1', [first.id]);

    const res = await api.get('/api/v1/branches').expect(200);
    expect(res.body.data.map((b) => b.name)).toEqual(['First', 'Second']);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(PUBLIC_KEYS);
    expect(res.body.data[0].lat).toBe(22.33);
  });

  test('get by id or slug; inactive and unknown → 404; junk param → 400', async () => {
    const b = await f.branch({ slug: 'sanmar-ocean-city' });
    const off = await f.branch({ is_active: false });
    expect((await api.get(`/api/v1/branches/${b.id}`).expect(200)).body.data.slug).toBe('sanmar-ocean-city');
    expect((await api.get('/api/v1/branches/sanmar-ocean-city').expect(200)).body.data.id).toBe(b.id);
    await api.get(`/api/v1/branches/${off.id}`).expect(404);
    await api.get(`/api/v1/branches/${off.slug}`).expect(404);
    await api.get('/api/v1/branches/no-such-branch').expect(404);
    await api.get('/api/v1/branches/Bad%20Slug!').expect(400);
  });
});

describe('staff branch admin', () => {
  test('GET /branches/admin: anon 401, customer 403, staff see inactive too', async () => {
    const { adminA, customer } = await world();
    await f.branch({ name: 'Closed', is_active: false });
    await api.get('/api/v1/branches/admin').expect(401);
    await api.get('/api/v1/branches/admin').set(f.auth(customer.token)).expect(403);
    const res = await api.get('/api/v1/branches/admin').set(f.auth(adminA.token)).expect(200);
    expect(res.body.data.map((b) => b.name)).toContain('Closed');
    expect(res.body.data[0]).toHaveProperty('is_active');
    expect(res.body.data.find((b) => b.name === 'Agrabad').staff_count).toBe(1);
  });

  test('create/update/delete are super_admin only (branch_admin blocked even for own branch)', async () => {
    const { branchA, adminA, customer } = await world();
    const body = { name: 'Halishahar', address: 'Port Connecting Road, Chattogram' };
    await api.post('/api/v1/branches').send(body).expect(401);
    await api.post('/api/v1/branches').set(f.auth(customer.token)).send(body).expect(403);
    await api.post('/api/v1/branches').set(f.auth(adminA.token)).send(body).expect(403);
    await api.put(`/api/v1/branches/${branchA.id}`).set(f.auth(adminA.token)).send({ name: 'Mine now' }).expect(403);
    await api.delete(`/api/v1/branches/${branchA.id}`).set(f.auth(adminA.token)).expect(403);
  });

  test('create generates a unique slug, validates input and audits', async () => {
    const { sa } = await world();
    const body = {
      name: 'Sanmar Ocean City', address: 'Shop 451, Level 4, Sanmar Ocean City, Chattogram',
      phone: '031-2510000', whatsapp: '+880 1886-670543', email: 'SHOP@Example.com',
      opening_hours: 'Sat–Thu 11:00–21:00', map_url: 'https://maps.google.com/?q=22.36,91.82',
      lat: 22.36, lng: 91.82, sort_order: 1,
    };
    const a = await api.post('/api/v1/branches').set(f.auth(sa.token)).send(body).expect(201);
    expect(a.body.data.slug).toBe('sanmar-ocean-city');
    expect(a.body.data.whatsapp).toBe('01886670543');
    expect(a.body.data.email).toBe('shop@example.com');
    const b = await api.post('/api/v1/branches').set(f.auth(sa.token)).send(body).expect(201);
    expect(b.body.data.slug).toBe('sanmar-ocean-city-2');
    await api.post('/api/v1/branches').set(f.auth(sa.token)).send({ ...body, slug: 'sanmar-ocean-city' }).expect(409);
    expect(await auditCount('branch.create')).toBe(2);

    const bad = [
      { ...body, map_url: 'javascript:alert(1)' },
      { ...body, lat: 100 },
      { ...body, whatsapp: '12345' },
      { ...body, name: ['x', 'y'] },
      { ...body, address: 'x'.repeat(501) },
      { ...body, sort_order: 1.5 },
      { address: body.address },
    ];
    for (const payload of bad) {
      await api.post('/api/v1/branches').set(f.auth(sa.token)).send(payload).expect(400);
    }
  });

  test('update: partial, slug conflicts → 409, empty → 400, unknown → 404, unknown keys ignored', async () => {
    const { sa, branchA, branchB } = await world();
    const res = await api.put(`/api/v1/branches/${branchA.id}`).set(f.auth(sa.token))
      .send({ opening_hours: '10:00–20:00', is_active: false, id: branchB.id, created_at: '2000-01-01' }).expect(200);
    expect(res.body.data.opening_hours).toBe('10:00–20:00');
    expect(res.body.data.is_active).toBe(false);
    expect(res.body.data.id).toBe(branchA.id);
    await api.put(`/api/v1/branches/${branchA.id}`).set(f.auth(sa.token)).send({ slug: branchB.slug }).expect(409);
    await api.put(`/api/v1/branches/${branchA.id}`).set(f.auth(sa.token)).send({}).expect(400);
    await api.put('/api/v1/branches/00000000-0000-4000-8000-000000000000').set(f.auth(sa.token)).send({ name: 'Nope' }).expect(404);
    expect(await auditCount('branch.update', branchA.id)).toBe(1);
  });

  test('delete: unused → 200; with staff, stock, orders or tickets → 409 (deactivate instead)', async () => {
    const { sa, branchA } = await world(); // branchA has a branch_admin
    await api.delete(`/api/v1/branches/${branchA.id}`).set(f.auth(sa.token)).expect(409);

    const stocked = await f.branch();
    await f.product({ variants: [{ stock: [{ branch_id: stocked.id, quantity: 0 }] }] });
    const r = await api.delete(`/api/v1/branches/${stocked.id}`).set(f.auth(sa.token)).expect(409);
    expect(r.body.message).toMatch(/deactivate/i);

    const ticketed = await f.branch();
    await query(
      `INSERT INTO repair_tickets (ticket_number, customer_name, customer_phone, device_type, issue_description, branch_id)
       VALUES ('RPR-T-1', 'A', '01711000000', 'Laptop', 'Broken screen badly', $1)`, [ticketed.id]
    );
    await api.delete(`/api/v1/branches/${ticketed.id}`).set(f.auth(sa.token)).expect(409);

    const empty = await f.branch();
    await api.delete(`/api/v1/branches/${empty.id}`).set(f.auth(sa.token)).expect(200);
    await api.get(`/api/v1/branches/${empty.id}`).expect(404);
    expect(await auditCount('branch.delete', empty.id)).toBe(1);
  });
});
