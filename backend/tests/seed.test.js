const { execFileSync } = require('child_process');
const path = require('path');
const { api, resetDb, query } = require('./helpers');

const SEED = path.join(__dirname, '..', 'scripts', 'seed.js');
const run = (env = {}, args = []) =>
  execFileSync('node', [SEED, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

beforeAll(async () => {
  await resetDb();
  run({ NODE_ENV: 'development' });
});

describe('demo seed', () => {
  test('refuses production without --allow-production', () => {
    expect(() => run({ NODE_ENV: 'production' })).toThrow(/Refusing to seed/);
  });

  test('is idempotent (skips a non-empty database)', () => {
    const out = run({ NODE_ENV: 'development' });
    expect(out).toMatch(/skip seed/);
  });

  test('creates both real branches and a realistic catalog', async () => {
    const b = await query('SELECT slug, address FROM branches ORDER BY sort_order');
    expect(b.rows.map((r) => r.slug)).toEqual(['gec', 'wasa']);
    expect(b.rows[0].address).toMatch(/Shop 451\/A, Level 4, Sanmar Ocean City, Nasirabad/);
    expect(b.rows[1].address).toMatch(/Shop 502, Level 5, Meridian Kohinoor City/);
    const stocked = await query('SELECT COUNT(DISTINCT branch_id)::int AS n FROM inventory WHERE quantity > 0');
    expect(stocked.rows[0].n).toBe(2);
    const p = await query('SELECT COUNT(*)::int AS n FROM products');
    expect(p.rows[0].n).toBeGreaterThanOrEqual(30);
  });

  test('public catalog endpoints work on seeded data and never leak cost_price', async () => {
    const list = await api.get('/api/v1/products?limit=50').expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(30);
    expect(JSON.stringify(list.body)).not.toMatch(/cost_price/);

    const used = await api.get('/api/v1/products?category=laptops&condition=used').expect(200);
    expect(used.body.data.length).toBeGreaterThan(5);

    const featured = await api.get('/api/v1/products/featured').expect(200);
    expect(featured.body.data.length).toBeGreaterThan(0);

    const search = await api.get('/api/v1/products/search?q=thinkpad').expect(200);
    expect(search.body.data.length).toBeGreaterThan(0);

    const slug = list.body.data[0].slug;
    const detail = await api.get(`/api/v1/products/${slug}`).expect(200);
    expect(detail.body.data.variants.length).toBeGreaterThan(0);
    expect(JSON.stringify(detail.body)).not.toMatch(/cost_price/);

    await api.get('/api/v1/categories').expect(200);
    await api.get('/api/v1/brands').expect(200);
    await api.get('/api/v1/branches').expect(200);
    const services = await api.get('/api/v1/repairs/services').expect(200);
    expect(services.body.data.length).toBeGreaterThanOrEqual(10);
  });

  test('a seeded sale price is what the product page shows', async () => {
    const { rows } = await query(
      `SELECT p.slug, pv.sku, pv.sale_price FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.sale_price IS NOT NULL LIMIT 1`
    );
    const detail = await api.get(`/api/v1/products/${rows[0].slug}`).expect(200);
    const v = detail.body.data.variants.find((x) => x.sku === rows[0].sku);
    expect(Number(v.price)).toBe(Number(rows[0].sale_price));
  });
});
