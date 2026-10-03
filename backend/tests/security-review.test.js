/**
 * Regression tests for the pre-launch security review findings
 * (foundation / catalog / operations). Each test reproduces the original
 * exploit and asserts it is now blocked.
 */
// Honour X-Forwarded-For so tests can simulate distinct client IPs.
process.env.TRUST_PROXY = '1';

jest.mock('../src/lib/sms', () => {
  const sent = [];
  return { sent, isConfigured: () => true, send: jest.fn(async (phone, message) => { sent.push({ phone, message }); }) };
});

const { execFileSync } = require('child_process');
const path = require('path');
const bcrypt = require('bcryptjs');
const { api, query, resetDb, factories: f, phone } = require('./helpers');

beforeEach(resetDb);

const withRateLimits = () => {
  const old = process.env.TEST_RATE_LIMIT;
  beforeAll(() => { process.env.TEST_RATE_LIMIT = '1'; });
  afterAll(() => { process.env.TEST_RATE_LIMIT = old; });
};

const shop = async () => {
  const branch = await f.branch();
  const admin = await f.user({ role: 'branch_admin', branch_id: branch.id });
  const sa = await f.user({ role: 'super_admin', branch_id: branch.id });
  const { product, variants: [variant] } = await f.product({ variants: [{ price: 100000, stock: [{ branch_id: branch.id, quantity: 5 }] }] });
  return { branch, admin, sa, product, variant };
};

describe('H1: branch staff may change every price, and every change is audited', () => {
  test('selling and cost prices: staff OK, each change logged with who and before/after', async () => {
    const { admin, sa, variant } = await shop();
    const url = `/api/v1/products/variants/${variant.id}`;
    await api.put(url).set(f.auth(admin.token)).send({ price: 95000 }).expect(200);
    await api.put(url).set(f.auth(admin.token))
      .send({ sale_price: 1, sale_starts_at: new Date(Date.now() - 1000).toISOString(), sale_ends_at: new Date(Date.now() + 60000).toISOString() })
      .expect(200);
    await api.put(url).set(f.auth(admin.token)).send({ cost_price: 40000 }).expect(200);
    await api.put(url).set(f.auth(sa.token)).send({ cost_price: 50000 }).expect(200);

    const { rows } = await query(
      "SELECT actor_id, data FROM admin_audit_log WHERE action = 'variant.update' AND entity_id = $1 ORDER BY created_at",
      [variant.id]
    );
    expect(rows.map((r) => r.actor_id)).toEqual([admin.user.id, admin.user.id, admin.user.id, sa.user.id]);
    expect(rows[2].data).toMatchObject({ after: { cost_price: 40000 } });
    expect(rows[3].data).toMatchObject({ before: { cost_price: '40000.00' }, after: { cost_price: 50000 } });
  });
});

describe('H2: placeholder secrets are refused in production', () => {
  const load = (env) => execFileSync('node', ['-e', "require('./src/config')"], {
    cwd: path.join(__dirname, '..'),
    env: { PATH: process.env.PATH, NODE_ENV: 'production', SSLCOMMERZ_IS_SANDBOX: 'false', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const strong = 'a3f1c9e27b5d48e0a1b2c3d4e5f60718293a4b5c6d7e8f90';
  test.each([
    [{ JWT_SECRET: 'change_me_at_least_32_random_chars' }],
    [{ JWT_SECRET: strong, INTERNAL_API_KEY: 'change_me_random' }],
    [{ JWT_SECRET: strong, INTERNAL_API_KEY: 'short' }],
  ])('%j → startup error', (env) => {
    expect(() => load(env)).toThrow();
  });
  test('strong secrets load', () => {
    expect(() => load({ JWT_SECRET: strong, INTERNAL_API_KEY: strong })).not.toThrow();
  });

  test('SSLCommerz sandbox fails closed in production', () => {
    expect(() => load({ JWT_SECRET: strong, SSLCOMMERZ_IS_SANDBOX: '' })).toThrow(/must be set/);
    expect(() => load({ JWT_SECRET: strong, SSLCOMMERZ_IS_SANDBOX: 'no' })).toThrow(/"true" or "false"/);
    expect(() => load({ JWT_SECRET: strong, SSLCOMMERZ_IS_SANDBOX: 'true' })).toThrow(/fake/);
    expect(() => load({ JWT_SECRET: strong, SSLCOMMERZ_IS_SANDBOX: 'true', ALLOW_SANDBOX_IN_PRODUCTION: 'true' })).not.toThrow();
  });
});

describe('M3/M6: rate limits', () => {
  withRateLimits();

  test('the internal key does not bypass login brute-force limits', async () => {
    const { user } = await f.user();
    let last;
    for (let i = 0; i < 11; i++) {
      last = await api.post('/api/v1/auth/login').set('X-Internal-Key', 'test-internal-key')
        .set('X-Forwarded-For', '203.0.113.7').send({ phone: user.phone, password: 'wrong-password' });
    }
    expect(last.status).toBe(429);
  });

  test("an attacker's failed logins don't lock the real owner out", async () => {
    const { user } = await f.user();
    for (let i = 0; i < 12; i++) {
      await api.post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.9')
        .send({ phone: user.phone, password: 'wrong-password' });
    }
    // Same phone, owner's own network, correct password.
    await api.post('/api/v1/auth/login').set('X-Forwarded-For', '192.0.2.44')
      .send({ phone: user.phone, password: f.PASSWORD }).expect(200);
  });

  test('successful logins never consume the failure budget', async () => {
    const { user } = await f.user();
    for (let i = 0; i < 12; i++) {
      await api.post('/api/v1/auth/login').set('X-Forwarded-For', '192.0.2.50')
        .send({ phone: user.phone, password: f.PASSWORD }).expect(200);
    }
  });

  test('IPv6 clients are limited per /64, so rotating addresses does not help', async () => {
    const { user } = await f.user();
    let last;
    for (let i = 0; i < 11; i++) {
      last = await api.post('/api/v1/auth/login').set('X-Forwarded-For', `2001:db8:1:2::${(i + 1).toString(16)}`)
        .send({ phone: user.phone, password: 'wrong-password' });
    }
    expect(last.status).toBe(429);
  });
});

describe('M4: in-store purchases only link to verified phone owners', () => {
  test('an unverified account registered with the buyer\'s phone gets nothing', async () => {
    const { admin, variant } = await shop();
    const squatter = await f.user({ phone_verified: false });
    await api.post('/api/v1/pos/sales').set(f.auth(admin.token))
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], payment_method: 'cash', customer_phone: squatter.user.phone })
      .expect(201);
    const mine = await api.get('/api/v1/orders/mine').set(f.auth(squatter.token)).expect(200);
    expect(mine.body.data).toHaveLength(0);
  });

  test('a verified customer does get the sale on their account', async () => {
    const { admin, variant } = await shop();
    const cust = await f.user({ phone_verified: true });
    await api.post('/api/v1/pos/sales').set(f.auth(admin.token))
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], payment_method: 'cash', customer_phone: cust.user.phone })
      .expect(201);
    const mine = await api.get('/api/v1/orders/mine').set(f.auth(cust.token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
  });
});

describe('M5: promoting a squatted (unverified) account', () => {
  test('requires a new password, which locks the squatter out', async () => {
    const { branch, sa } = await shop();
    const squatter = await f.user({ phone_verified: false });
    const url = `/api/v1/users/${squatter.user.id}/role`;
    const refused = await api.patch(url).set(f.auth(sa.token)).send({ role: 'branch_admin', branch_id: branch.id }).expect(409);
    expect(refused.body.message).toMatch(/new password/);

    await api.patch(url).set(f.auth(sa.token))
      .send({ role: 'branch_admin', branch_id: branch.id, new_password: 'handed-over-in-person' }).expect(200);
    await api.post('/api/v1/auth/login').send({ phone: squatter.user.phone, password: f.PASSWORD }).expect(401);
    await api.post('/api/v1/auth/login').send({ phone: squatter.user.phone, password: 'handed-over-in-person' }).expect(200);
    const log = await query("SELECT data FROM admin_audit_log WHERE action = 'user.role'");
    expect(JSON.stringify(log.rows)).not.toMatch(/handed-over-in-person/);
  });

  test('createStaff on a taken phone explains the safe path', async () => {
    const { branch, sa } = await shop();
    const existing = await f.user();
    const res = await api.post('/api/v1/users/staff').set(f.auth(sa.token))
      .send({ full_name: 'New Hire', phone: existing.user.phone, password: 'longenough1', role: 'branch_admin', branch_id: branch.id })
      .expect(409);
    expect(res.body.message).toMatch(/set a new password/);
  });
});

describe('M7: password hashing does not block the event loop', () => {
  test('new hashes are scrypt; legacy bcrypt hashes still work and are upgraded', async () => {
    const reg = await api.post('/api/v1/auth/register').send({ full_name: 'New User', phone: phone(), password: 'longenough1' }).expect(201);
    const stored = await query('SELECT password_hash FROM users WHERE id = $1', [reg.body.data.user.id]);
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$15\$8\$1\$/);

    const legacyPhone = phone();
    await query(
      `INSERT INTO users (full_name, phone, password_hash) VALUES ('Legacy', $1, $2)`,
      [legacyPhone, bcrypt.hashSync('legacy-pass-1', 4)]
    );
    await api.post('/api/v1/auth/login').send({ phone: legacyPhone, password: 'legacy-pass-1' }).expect(200);
    const upgraded = await query('SELECT password_hash FROM users WHERE phone = $1', [legacyPhone]);
    expect(upgraded.rows[0].password_hash).toMatch(/^scrypt\$/);
    await api.post('/api/v1/auth/login').send({ phone: legacyPhone, password: 'legacy-pass-1' }).expect(200);
  });

  test('a burst of logins for unknown phones leaves the API responsive', async () => {
    const { app } = require('./helpers');
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    try {
      // fetch sends eagerly, so all 16 logins are in flight before the health check.
      const burst = Array.from({ length: 16 }, () => fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: phone(), password: 'whatever-123' }),
      }));
      await new Promise((r) => setTimeout(r, 30));
      const t0 = Date.now();
      const health = await fetch(`${base}/health`);
      const latency = Date.now() - t0;
      const results = await Promise.all(burst);
      expect(health.status).toBe(200);
      expect(results.every((r) => r.status === 401)).toBe(true);
      // With bcryptjs this was ~7 s (every hash blocked the event loop).
      expect(latency).toBeLessThan(1000);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('M9: coupons with a per-customer limit need a known customer at POS', () => {
  test('anonymous walk-ins cannot reuse a once-per-customer code', async () => {
    const { admin, variant } = await shop();
    await query(
      `INSERT INTO coupons (code, discount_type, discount_value, per_user_limit, valid_from, valid_until)
       VALUES ('ONCE', 'fixed', 500, 1, NOW() - interval '1 day', NOW() + interval '1 day')`
    );
    const res = await api.post('/api/v1/pos/sales').set(f.auth(admin.token))
      .send({ items: [{ variant_id: variant.id, quantity: 1 }], payment_method: 'cash', coupon_code: 'ONCE' })
      .expect(400);
    expect(res.body.message).toMatch(/registered customer/);
  });
});

describe('L11: password-reset OTP does not reveal registered phones', () => {
  test('known and unknown phones get identical responses, including the cooldown', async () => {
    const { user } = await f.user();
    const unknown = phone();
    const a1 = await api.post('/api/v1/auth/otp/send').send({ phone: user.phone, purpose: 'password_reset' });
    const b1 = await api.post('/api/v1/auth/otp/send').send({ phone: unknown, purpose: 'password_reset' });
    const a2 = await api.post('/api/v1/auth/otp/send').send({ phone: user.phone, purpose: 'password_reset' });
    const b2 = await api.post('/api/v1/auth/otp/send').send({ phone: unknown, purpose: 'password_reset' });
    expect([a1.status, a1.body]).toEqual([b1.status, b1.body]);
    expect([a2.status, a2.body]).toEqual([b2.status, b2.body]);
    expect(a2.status).toBe(429);
  });
});

describe('L12: ids are case-insensitive everywhere', () => {
  test('a category cannot be made its own parent with an upper-case id', async () => {
    const { sa } = await shop();
    const cat = await f.category();
    const res = await api.put(`/api/v1/categories/${cat.id}`).set(f.auth(sa.token))
      .send({ parent_id: cat.id.toUpperCase() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const row = await query('SELECT parent_id FROM categories WHERE id = $1', [cat.id]);
    expect(row.rows[0].parent_id).toBeNull();
  });

  test('the database refuses a self-parent even if code is bypassed', async () => {
    const cat = await f.category();
    await expect(query('UPDATE categories SET parent_id = id WHERE id = $1', [cat.id])).rejects.toThrow();
  });
});

describe('L5: database constraints back up money validation', () => {
  test('negative totals, oversize discounts and >100% coupons are rejected by the DB', async () => {
    await expect(query(
      `INSERT INTO orders (order_number, channel, status, subtotal, discount, shipping_fee, total_amount)
       VALUES ('X-1', 'online', 'pending', 100, 200, 0, -100)`
    )).rejects.toThrow();
    await expect(query(
      `INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until)
       VALUES ('TOOMUCH', 'percentage', 150, NOW(), NOW() + interval '1 day')`
    )).rejects.toThrow();
  });
});

describe('L14: audit entries record the client IP', () => {
  test('admin actions are attributed to the caller address', async () => {
    const { sa } = await shop();
    await api.post('/api/v1/branches').set(f.auth(sa.token)).set('X-Forwarded-For', '203.0.113.99')
      .send({ name: 'Audit Branch', address: 'Somewhere in Chattogram' }).expect(201);
    const log = await query("SELECT ip FROM admin_audit_log WHERE action LIKE 'branch.%' ORDER BY created_at DESC LIMIT 1");
    expect(log.rows[0].ip).toBe('203.0.113.99');
  });
});
