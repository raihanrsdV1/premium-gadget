jest.mock('../src/lib/sms', () => {
  const sent = [];
  return {
    sent,
    isConfigured: () => true,
    send: jest.fn(async (phone, message) => {
      sent.push({ phone, message });
      return { delivered: true };
    }),
  };
});

const jwt = require('jsonwebtoken');
const sms = require('../src/lib/sms');
const { api, query, resetDb, factories: f, phone } = require('./helpers');

const lastCode = () => sms.sent[sms.sent.length - 1].message.match(/\b(\d{6})\b/)[1];

beforeEach(async () => {
  await resetDb();
  sms.sent.length = 0;
});

describe('health & error handling', () => {
  test('health checks the database', async () => {
    const res = await api.get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  test('unknown route → 404 JSON without echoing the URL', async () => {
    const res = await api.get('/api/v1/nope/<script>').expect(404);
    expect(res.body).toEqual({ success: false, message: 'Route not found' });
  });

  test('invalid uuid in a DB query → 400, no Postgres internals leaked', async () => {
    const { token } = await f.user({ role: 'super_admin' });
    const res = await api.get('/api/v1/users/not-a-uuid').set(f.auth(token)).expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/syntax|uuid:|pg_|stack/i);
  });

  test('malformed JSON → 400', async () => {
    await api.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"phone":').expect(400);
  });

  test('security headers present, no x-powered-by', async () => {
    const res = await api.get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  test('CORS reflects only allowlisted origins', async () => {
    const ok = await api.get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const bad = await api.get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const nul = await api.get('/api/v1/health').set('Origin', 'null');
    expect(nul.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('auth', () => {
  test('register normalizes +880 phone, forces customer role, rejects short password', async () => {
    await api.post('/api/v1/auth/register')
      .send({ full_name: 'Rahim', phone: '+8801711000111', password: 'short' })
      .expect(400);

    const res = await api.post('/api/v1/auth/register')
      .send({ full_name: 'Rahim', phone: '+880 1711-000111', password: 'longenough1', role: 'super_admin' })
      .expect(201);
    expect(res.body.data.user.phone).toBe('01711000111');
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.user.token_version).toBeUndefined();
  });

  test('duplicate phone → 409', async () => {
    const p = phone();
    await api.post('/api/v1/auth/register').send({ full_name: 'A B', phone: p, password: 'longenough1' }).expect(201);
    await api.post('/api/v1/auth/register').send({ full_name: 'A B', phone: p, password: 'longenough1' }).expect(409);
  });

  test('login: wrong password and unknown phone give the same 401', async () => {
    const { user } = await f.user();
    const a = await api.post('/api/v1/auth/login').send({ phone: user.phone, password: 'wrong-pass' }).expect(401);
    const b = await api.post('/api/v1/auth/login').send({ phone: phone(), password: 'wrong-pass' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('login works and deactivated users are refused', async () => {
    const { user } = await f.user();
    const ok = await api.post('/api/v1/auth/login').send({ phone: user.phone, password: f.PASSWORD }).expect(200);
    expect(ok.body.data.token).toBeTruthy();

    const { user: off } = await f.user({ is_active: false });
    await api.post('/api/v1/auth/login').send({ phone: off.phone, password: f.PASSWORD }).expect(403);
  });

  test('staff tokens are short-lived, customer tokens long-lived', async () => {
    const { token: staff } = await f.user({ role: 'branch_admin' });
    const { token: cust } = await f.user();
    const s = jwt.decode(staff);
    const c = jwt.decode(cust);
    expect(s.exp - s.iat).toBe(12 * 3600);
    expect(c.exp - c.iat).toBe(7 * 24 * 3600);
  });

  test('tokens signed with another secret or alg=none are rejected', async () => {
    const { user } = await f.user({ role: 'super_admin' });
    const forged = jwt.sign({ id: user.id, role: 'super_admin', tv: 0 }, 'super_secret_jwt_key_change_in_production_2024');
    await api.get('/api/v1/auth/profile').set(f.auth(forged)).expect(401);
    const none = jwt.sign({ id: user.id, role: 'super_admin', tv: 0 }, '', { algorithm: 'none' });
    await api.get('/api/v1/auth/profile').set(f.auth(none)).expect(401);
  });

  test('logout-all revokes existing tokens', async () => {
    const { token } = await f.user();
    await api.get('/api/v1/auth/profile').set(f.auth(token)).expect(200);
    await api.post('/api/v1/auth/logout-all').set(f.auth(token)).expect(200);
    await api.get('/api/v1/auth/profile').set(f.auth(token)).expect(401);
  });

  test('change password: requires current password, revokes old token, returns new one', async () => {
    const { token } = await f.user();
    await api.post('/api/v1/auth/password/change').set(f.auth(token))
      .send({ current_password: 'wrong', new_password: 'newpassword1' }).expect(400);
    const res = await api.post('/api/v1/auth/password/change').set(f.auth(token))
      .send({ current_password: f.PASSWORD, new_password: 'newpassword1' }).expect(200);
    await api.get('/api/v1/auth/profile').set(f.auth(token)).expect(401);
    await api.get('/api/v1/auth/profile').set(f.auth(res.body.data.token)).expect(200);
  });

  test('profile update cannot change role or phone', async () => {
    const { user, token } = await f.user();
    const res = await api.put('/api/v1/auth/profile').set(f.auth(token))
      .send({ full_name: 'New Name', role: 'super_admin', phone: '01999999999' }).expect(200);
    expect(res.body.data.full_name).toBe('New Name');
    expect(res.body.data.role).toBe('customer');
    expect(res.body.data.phone).toBe(user.phone);
  });

  test('profile avatar must be http(s)', async () => {
    const { token } = await f.user();
    await api.put('/api/v1/auth/profile').set(f.auth(token)).send({ avatar_url: 'javascript:alert(1)' }).expect(400);
  });
});

describe('OTP & password reset', () => {
  test('codes are stored hashed and verify once', async () => {
    const { user } = await f.user({ phone_verified: false });
    await api.post('/api/v1/auth/otp/send').send({ phone: user.phone }).expect(200);
    const code = lastCode();
    const stored = await query('SELECT code FROM otp_codes WHERE phone = $1', [user.phone]);
    expect(stored.rows[0].code).not.toBe(code);
    expect(stored.rows[0].code).toHaveLength(64);

    await api.post('/api/v1/auth/otp/verify').send({ phone: user.phone, code }).expect(200);
    await api.post('/api/v1/auth/otp/verify').send({ phone: user.phone, code }).expect(400);
    const u = await query('SELECT phone_verified FROM users WHERE id = $1', [user.id]);
    expect(u.rows[0].phone_verified).toBe(true);
  });

  test('resend cooldown', async () => {
    const p = phone();
    await api.post('/api/v1/auth/otp/send').send({ phone: p }).expect(200);
    await api.post('/api/v1/auth/otp/send').send({ phone: p }).expect(429);
  });

  test('code burns after 5 wrong attempts', async () => {
    const p = phone();
    await api.post('/api/v1/auth/otp/send').send({ phone: p }).expect(200);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await api.post('/api/v1/auth/otp/verify').send({ phone: p, code: wrong }).expect(400);
    }
    await api.post('/api/v1/auth/otp/verify').send({ phone: p, code }).expect(400);
  });

  test('password reset with OTP revokes sessions; unknown phones get the same response', async () => {
    const { user, token } = await f.user();
    const unknown = await api.post('/api/v1/auth/otp/send').send({ phone: phone(), purpose: 'password_reset' }).expect(200);
    expect(sms.sent).toHaveLength(0);

    const known = await api.post('/api/v1/auth/otp/send').send({ phone: user.phone, purpose: 'password_reset' }).expect(200);
    expect(known.body).toEqual(unknown.body);
    const code = lastCode();

    await api.post('/api/v1/auth/password/reset').send({ phone: user.phone, code, new_password: 'brandnewpass1' }).expect(200);
    await api.get('/api/v1/auth/profile').set(f.auth(token)).expect(401);
    await api.post('/api/v1/auth/login').send({ phone: user.phone, password: 'brandnewpass1' }).expect(200);
  });

  test('a phone_verify code cannot reset a password', async () => {
    const { user } = await f.user();
    await api.post('/api/v1/auth/otp/send').send({ phone: user.phone }).expect(200);
    await api.post('/api/v1/auth/password/reset')
      .send({ phone: user.phone, code: lastCode(), new_password: 'brandnewpass1' }).expect(400);
  });
});

describe('users (IDOR fix)', () => {
  test('a customer cannot read or edit another user', async () => {
    const { token } = await f.user();
    const { user: victim } = await f.user();
    await api.get(`/api/v1/users/${victim.id}`).set(f.auth(token)).expect(403);
    await api.put(`/api/v1/users/${victim.id}`).set(f.auth(token)).send({ full_name: 'Hacked' }).expect(403);
  });

  test('a user can read their own record', async () => {
    const { user, token } = await f.user();
    const res = await api.get(`/api/v1/users/${user.id}`).set(f.auth(token)).expect(200);
    expect(res.body.data.id).toBe(user.id);
  });

  test('branch_admin cannot list users; super_admin can, with search', async () => {
    const { token: ba } = await f.user({ role: 'branch_admin' });
    await api.get('/api/v1/users').set(f.auth(ba)).expect(403);

    const { token: sa } = await f.user({ role: 'super_admin' });
    await f.user({ full_name: 'Karim Uddin' });
    const res = await api.get('/api/v1/users?q=karim').set(f.auth(sa)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].password_hash).toBeUndefined();
  });

  test('super_admin cannot delete themselves; deleted users lose access', async () => {
    const { user: admin, token } = await f.user({ role: 'super_admin' });
    await api.delete(`/api/v1/users/${admin.id}`).set(f.auth(token)).expect(400);

    const { user: victim, token: victimToken } = await f.user();
    await api.delete(`/api/v1/users/${victim.id}`).set(f.auth(token)).expect(200);
    await api.get('/api/v1/auth/profile').set(f.auth(victimToken)).expect(401);
  });
});

describe('rate limiting', () => {
  const OLD = process.env.TEST_RATE_LIMIT;
  beforeAll(() => { process.env.TEST_RATE_LIMIT = '1'; });
  afterAll(() => { process.env.TEST_RATE_LIMIT = OLD; });

  test('per-phone login limiter blocks brute force regardless of IP', async () => {
    const p = phone();
    let last;
    for (let i = 0; i < 11; i++) {
      last = await api.post('/api/v1/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ phone: p, password: 'wrong-pass' });
    }
    expect(last.status).toBe(429);
  });
});
