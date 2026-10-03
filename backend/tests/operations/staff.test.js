const { api, query, resetDb, factories: f, phone } = require('../helpers');
const { world, auditCount } = require('./ops.helpers');

const U = '/api/v1/users';
let w;

beforeEach(async () => {
  await resetDb();
  w = await world();
});

const as = (who) => f.auth(who.token);
const login = (p, password) => api.post('/api/v1/auth/login').send({ phone: p, password });

// The loser is refused either by the in-transaction check (403) or, if the
// winner committed first, because its own session was just revoked (401).
const expectOneWinner = (r1, r2) => {
  const statuses = [r1.status, r2.status].sort();
  expect(statuses[0]).toBe(200);
  expect([401, 403]).toContain(statuses[1]);
};

describe('POST /users/staff', () => {
  const staffBody = (overrides = {}) => ({
    full_name: 'Shop Staff', phone: phone(), email: 'staff@example.com', password: 'longenough1',
    role: 'branch_admin', branch_id: w.branchA.id, ...overrides,
  });

  test('super_admin only', async () => {
    await api.post(`${U}/staff`).send(staffBody()).expect(401);
    await api.post(`${U}/staff`).set(as(w.customer)).send(staffBody()).expect(403);
    await api.post(`${U}/staff`).set(as(w.adminA)).send(staffBody()).expect(403);
  });

  test('creates a verified staff account (scrypt hash) that can log in', async () => {
    const body = staffBody({ phone: '+880 1811-000111' });
    const res = await api.post(`${U}/staff`).set(as(w.sa)).send(body).expect(201);
    expect(res.body.data).toMatchObject({ role: 'branch_admin', branch_id: w.branchA.id, phone: '01811000111', phone_verified: true });
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('token_version');
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [res.body.data.id]);
    expect(rows[0].password_hash).toMatch(/^scrypt\$15\$8\$1\$/);
    const ok = await login('01811000111', 'longenough1').expect(200);
    expect(ok.body.data.user.role).toBe('branch_admin');

    const log = await query("SELECT data FROM admin_audit_log WHERE action = 'user.create_staff'");
    expect(JSON.stringify(log.rows)).not.toMatch(/longenough1|password/);
  });

  test('validation, branch rules and uniqueness', async () => {
    const closed = await f.branch({ is_active: false });
    const bad = [
      staffBody({ branch_id: undefined }),
      staffBody({ branch_id: null }),
      staffBody({ branch_id: closed.id }),
      staffBody({ branch_id: '00000000-0000-4000-8000-000000000000' }),
      staffBody({ role: 'customer' }),
      staffBody({ role: ['super_admin'] }),
      staffBody({ password: 'short' }),
      staffBody({ phone: '12345' }),
      staffBody({ email: 'nope' }),
      staffBody({ full_name: 'x'.repeat(121) }),
    ];
    for (const body of bad) await api.post(`${U}/staff`).set(as(w.sa)).send(body).expect(400);

    // A super_admin needs no branch.
    await api.post(`${U}/staff`).set(as(w.sa)).send(staffBody({ role: 'super_admin', branch_id: undefined, email: undefined })).expect(201);
    const dupPhone = await api.post(`${U}/staff`).set(as(w.sa)).send(staffBody({ phone: w.customer.user.phone })).expect(409);
    expect(dupPhone.body.message).toMatch(/role/);
    await api.post(`${U}/staff`).set(as(w.sa)).send(staffBody()).expect(201);
    await api.post(`${U}/staff`).set(as(w.sa)).send(staffBody({ email: 'STAFF@example.com' })).expect(409);
  });
});

describe('PATCH /users/:id/role', () => {
  test('promote a customer to branch_admin: sessions revoked, audited', async () => {
    const res = await api.patch(`${U}/${w.customer.user.id}/role`).set(as(w.sa))
      .send({ role: 'branch_admin', branch_id: w.branchB.id }).expect(200);
    expect(res.body.data).toMatchObject({ role: 'branch_admin', branch_id: w.branchB.id });
    await api.get('/api/v1/auth/profile').set(as(w.customer)).expect(401);
    const log = await query("SELECT data FROM admin_audit_log WHERE action = 'user.role'");
    expect(log.rows[0].data).toMatchObject({ from: { role: 'customer' }, to: { role: 'branch_admin', branch_id: w.branchB.id } });
  });

  test('demoting to customer clears the branch; validation', async () => {
    const res = await api.patch(`${U}/${w.adminA.user.id}/role`).set(as(w.sa))
      .send({ role: 'customer', branch_id: w.branchA.id }).expect(200);
    expect(res.body.data).toMatchObject({ role: 'customer', branch_id: null });
    const t = as(w.sa);
    await api.patch(`${U}/${w.adminB.user.id}/role`).set(t).send({ role: 'branch_admin' }).expect(400);
    await api.patch(`${U}/${w.adminB.user.id}/role`).set(t).send({ role: 'owner' }).expect(400);
    await api.patch(`${U}/${w.adminB.user.id}/role`).set(t).send({ role: 'branch_admin', branch_id: (await f.branch({ is_active: false })).id }).expect(400);
    await api.patch(`${U}/00000000-0000-4000-8000-000000000000/role`).set(t).send({ role: 'customer' }).expect(404);
  });

  test('only a super_admin; never your own role (not even via an upper-case id)', async () => {
    await api.patch(`${U}/${w.customer.user.id}/role`).set(as(w.adminA)).send({ role: 'super_admin' }).expect(403);
    await api.patch(`${U}/${w.adminA.user.id}/role`).set(as(w.adminA)).send({ role: 'super_admin' }).expect(403);
    await api.patch(`${U}/${w.customer.user.id}/role`).set(as(w.customer)).send({ role: 'super_admin' }).expect(403);
    await api.patch(`${U}/${w.sa.user.id}/role`).set(as(w.sa)).send({ role: 'customer' }).expect(400);
    await api.patch(`${U}/${w.sa.user.id.toUpperCase()}/role`).set(as(w.sa)).send({ role: 'customer' }).expect(400);
    expect((await query('SELECT role FROM users WHERE id = $1', [w.sa.user.id])).rows[0].role).toBe('super_admin');
  });

  test('two super_admins demoting each other at once: one active super_admin always remains', async () => {
    const other = await f.user({ role: 'super_admin' });
    const [r1, r2] = await Promise.all([
      api.patch(`${U}/${other.user.id}/role`).set(as(w.sa)).send({ role: 'customer' }),
      api.patch(`${U}/${w.sa.user.id}/role`).set(as(other)).send({ role: 'customer' }),
    ]);
    expectOneWinner(r1, r2);
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND is_active AND deleted_at IS NULL");
    expect(rows[0].n).toBe(1);
  });
});

describe('PATCH /users/:id/status', () => {
  test('deactivate revokes sessions and blocks login; reactivate restores login', async () => {
    const t = as(w.sa);
    await api.patch(`${U}/${w.adminA.user.id}/status`).set(t).send({ is_active: false }).expect(200);
    await api.get('/api/v1/inventory').set(as(w.adminA)).expect(401);
    await login(w.adminA.user.phone, f.PASSWORD).expect(403);
    const res = await api.patch(`${U}/${w.adminA.user.id}/status`).set(t).send({ is_active: true }).expect(200);
    expect(res.body.data.is_active).toBe(true);
    await login(w.adminA.user.phone, f.PASSWORD).expect(200);
    expect(await auditCount('user.status', w.adminA.user.id)).toBe(2);
  });

  test('not yourself, not by non-super_admins; validation', async () => {
    await api.patch(`${U}/${w.sa.user.id}/status`).set(as(w.sa)).send({ is_active: false }).expect(400);
    await api.patch(`${U}/${w.sa.user.id.toUpperCase()}/status`).set(as(w.sa)).send({ is_active: false }).expect(400);
    await api.patch(`${U}/${w.adminB.user.id}/status`).set(as(w.adminA)).send({ is_active: false }).expect(403);
    await api.patch(`${U}/${w.adminB.user.id}/status`).set(as(w.sa)).send({ is_active: 'false' }).expect(400);
    await api.patch(`${U}/${w.adminB.user.id}/status`).set(as(w.sa)).send({}).expect(400);
  });

  test('the in-transaction guard (not just session revocation) stops the second demotion', async () => {
    const { pool } = require('../../src/config/database');
    const other = await f.user({ role: 'super_admin' });
    // Hold the super_admin row locks so both requests pass authentication
    // and then queue on the guard's FOR UPDATE.
    const holder = await pool.connect();
    let p1;
    let p2;
    try {
      await holder.query('BEGIN');
      await holder.query("SELECT id FROM users WHERE role = 'super_admin' FOR UPDATE");
      p1 = api.patch(`${U}/${other.user.id}/status`).set(as(w.sa)).send({ is_active: false }).then((r) => r);
      p2 = api.patch(`${U}/${w.sa.user.id}/status`).set(as(other)).send({ is_active: false }).then((r) => r);
      for (let i = 0; i < 60; i++) {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`
        );
        if (rows[0].n >= 2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      await holder.query('COMMIT');
      holder.release();
    }
    const [r1, r2] = await Promise.all([p1, p2]);
    expect([r1.status, r2.status].sort()).toEqual([200, 403]);
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND is_active");
    expect(rows[0].n).toBe(1);
  });

  test('mutual deactivation of the last two super_admins leaves one', async () => {
    const other = await f.user({ role: 'super_admin' });
    const [r1, r2] = await Promise.all([
      api.patch(`${U}/${other.user.id}/status`).set(as(w.sa)).send({ is_active: false }),
      api.patch(`${U}/${w.sa.user.id}/status`).set(as(other)).send({ is_active: false }),
    ]);
    expectOneWinner(r1, r2);
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND is_active");
    expect(rows[0].n).toBe(1);
  });

  test('mutual deletion of two super_admins leaves one', async () => {
    const other = await f.user({ role: 'super_admin' });
    const [r1, r2] = await Promise.all([
      api.delete(`${U}/${other.user.id}`).set(as(w.sa)),
      api.delete(`${U}/${w.sa.user.id}`).set(as(other)),
    ]);
    expectOneWinner(r1, r2);
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND is_active AND deleted_at IS NULL");
    expect(rows[0].n).toBe(1);
  });
});

describe('POST /users/:id/reset-password', () => {
  test('sets a new password, revokes sessions, never logs the password', async () => {
    await api.post(`${U}/${w.adminA.user.id}/reset-password`).set(as(w.sa)).send({ new_password: 'freshpass99' }).expect(200);
    await api.get('/api/v1/inventory').set(as(w.adminA)).expect(401);
    await login(w.adminA.user.phone, f.PASSWORD).expect(401);
    await login(w.adminA.user.phone, 'freshpass99').expect(200);
    const { rows } = await query("SELECT data FROM admin_audit_log WHERE action = 'user.reset_password'");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/freshpass99/);
  });

  test('not for yourself, not by non-super_admins; validation', async () => {
    await api.post(`${U}/${w.sa.user.id}/reset-password`).set(as(w.sa)).send({ new_password: 'freshpass99' }).expect(400);
    await api.post(`${U}/${w.adminB.user.id}/reset-password`).set(as(w.adminA)).send({ new_password: 'freshpass99' }).expect(403);
    await api.post(`${U}/${w.adminB.user.id}/reset-password`).set(as(w.customer)).send({ new_password: 'freshpass99' }).expect(403);
    await api.post(`${U}/${w.adminB.user.id}/reset-password`).send({ new_password: 'freshpass99' }).expect(401);
    await api.post(`${U}/${w.adminB.user.id}/reset-password`).set(as(w.sa)).send({ new_password: 'short' }).expect(400);
    await api.post(`${U}/${w.adminB.user.id}/reset-password`).set(as(w.sa)).send({ new_password: 'x'.repeat(129) }).expect(400);
    await api.post(`${U}/00000000-0000-4000-8000-000000000000/reset-password`).set(as(w.sa)).send({ new_password: 'freshpass99' }).expect(404);
  });
});

describe('GET /users filters', () => {
  test('filter staff by role, branch and active flag', async () => {
    await api.patch(`${U}/${w.adminB.user.id}/status`).set(as(w.sa)).send({ is_active: false }).expect(200);
    const t = as(w.sa);
    expect((await api.get(`${U}?role=branch_admin`).set(t)).body.data).toHaveLength(2);
    expect((await api.get(`${U}?branch_id=${w.branchA.id}`).set(t)).body.data.map((u) => u.id)).toEqual([w.adminA.user.id]);
    expect((await api.get(`${U}?role=branch_admin&is_active=false`).set(t)).body.data.map((u) => u.id)).toEqual([w.adminB.user.id]);
    await api.get(`${U}?is_active=maybe`).set(t).expect(400);
  });
});
