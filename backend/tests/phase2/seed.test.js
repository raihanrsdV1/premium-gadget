const { execFileSync } = require('child_process');
const path = require('path');
const { api, resetDb, query } = require('../helpers');
const { IMAGES, PRODUCTS } = require('../../src/db/seed/catalog');

const script = (name) => path.join(__dirname, '..', '..', 'scripts', name);
const run = (name, env = {}, args = []) =>
  execFileSync('node', [script(name), ...args], {
    env: { ...process.env, NODE_ENV: 'development', ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const KEY_SPECS = ['Processor', 'Display size', 'RAM', 'Storage'];

beforeAll(async () => {
  await resetDb();
  run('seed.js');
});

describe('seed: spec templates', () => {
  test('six templates; laptop subcategories inherit the Laptops template', async () => {
    const { rows } = await query('SELECT slug FROM categories WHERE spec_template IS NOT NULL ORDER BY slug');
    expect(rows.map((r) => r.slug)).toEqual(['accessories', 'audio', 'desktops', 'laptops', 'smart-watches', 'tablets']);

    const laptops = (await api.get('/api/v1/categories/laptops/spec-template').expect(200)).body.data;
    expect(laptops.template.groups.map((g) => g.name)).toEqual([
      'Processor', 'Display', 'Memory & Storage', 'Graphics', 'Keyboard & Input',
      'Connectivity', 'Battery & Power', 'Physical', 'Software & Warranty',
    ]);
    const highlights = laptops.template.groups.flatMap((g) => g.fields).filter((x) => x.highlight).map((x) => x.key);
    expect(highlights).toEqual(['processor', 'display_size', 'ram', 'storage']);
    for (const slug of ['laptops']) {
      const res = (await api.get(`/api/v1/categories/${slug}/spec-template`).expect(200)).body.data;
      expect(res.source_category_id).toBe(laptops.source_category_id);
    }
  });

  test('every seeded laptop has the four key specs; spec rows are linked to template fields', async () => {
    const list = (await api.get('/api/v1/products?category=laptops&limit=100').expect(200)).body.data;
    expect(list.length).toBeGreaterThanOrEqual(19);
    for (const p of list) expect(p.highlights.map((h) => h.label)).toEqual(KEY_SPECS);

    const unlinked = await query(
      'SELECT spec_key FROM product_specifications WHERE field_key IS NULL ORDER BY spec_key'
    );
    // Only deliberate custom rows (no matching template field) stay unlinked.
    expect(unlinked.rows.map((r) => r.spec_key)).toEqual(['Keyboard lighting', 'Numeric keypad', 'Plug', 'Spindle speed', 'Touch Bar']);
  });

  test('detail page groups follow the template; custom rows keep their group; warranty row added', async () => {
    const d = (await api.get('/api/v1/products/hp-probook-450-g8-used').expect(200)).body.data;
    expect(d.spec_groups.map((g) => g.name)).toEqual([
      'Processor', 'Display', 'Memory & Storage', 'Graphics', 'Keyboard & Input',
      'Connectivity', 'Battery & Power', 'Physical', 'Software & Warranty',
    ]);
    const input = d.spec_groups.find((g) => g.name === 'Keyboard & Input');
    expect(input.items.map((i) => [i.label, i.field_key])).toEqual([
      ['Backlit keyboard', 'keyboard_backlit'], ['Fingerprint reader', 'fingerprint'], ['Numeric keypad', null],
    ]);
    const sw = d.spec_groups.find((g) => g.name === 'Software & Warranty');
    expect(sw.items).toEqual([
      { label: 'Operating system', value: 'Windows 11 Pro', field_key: 'os' },
      { label: 'Warranty', value: '3 months shop warranty', field_key: 'warranty' },
    ]);
    expect(d.highlights.map((h) => h.label)).toEqual(KEY_SPECS);
    expect(d.specifications.length).toBeGreaterThan(15);

    const watch = (await api.get('/api/v1/products/apple-watch-series-7-45mm-gps-used').expect(200)).body.data;
    expect(watch.highlights.map((h) => h.label)).toEqual(['Case size', 'Connectivity', 'Battery life', 'Battery health']);
  });
});

describe('seed: banners', () => {
  test('hero: three product slides then the repairs slide; two promos', async () => {
    const hero = (await api.get('/api/v1/banners?placement=hero').expect(200)).body.data;
    expect(hero.map((b) => [b.type, b.title])).toEqual([
      ['product', 'Apple MacBook Air M1 13" (Used)'],
      ['product', 'ASUS ROG Strix G15 RTX 3060 (Used)'],
      ['product', 'Dell XPS 13 9310 (Used)'],
      ['custom', 'Expert laptop repairs in Chattogram'],
    ]);
    // The MacBook Air's seeded sale price is live.
    expect(hero[0].product).toMatchObject({ price: '65500.00', is_on_sale: true, in_stock: true });
    expect(hero[0].product.highlights.map((h) => h.label)).toEqual(KEY_SPECS);
    expect(hero[3]).toMatchObject({ link_url: '/repairs', image_url: IMAGES.circuit, cta_label: 'Book a repair', product: null });

    const promo = (await api.get('/api/v1/banners?placement=promo').expect(200)).body.data;
    expect(promo).toHaveLength(2);
    expect(promo.every((b) => b.type === 'custom' && b.image_url.startsWith('https://images.unsplash.com/'))).toBe(true);
  });
});

describe('scripts/seed-phase2.js (existing databases)', () => {
  test('refuses production without --allow-production', () => {
    expect(() => run('seed-phase2.js', { NODE_ENV: 'production' })).toThrow(/Refusing to seed/);
  });

  test('a no-op on an up-to-date database', async () => {
    const out = run('seed-phase2.js');
    expect(out).toMatch(/spec templates: 0 set, 6 kept/);
    expect(out).toMatch(new RegExp(`product specs: 0 mapped to template fields, ${PRODUCTS.length} already linked`));
    expect(out).toMatch(/banners: skipped \(6 already exist\)/);
  });

  test('upgrades a pre-Phase-2 database without wiping it, then is idempotent', async () => {
    // Make the database look like it was seeded before Phase 2.
    await query('UPDATE categories SET spec_template = NULL');
    await query('DELETE FROM banners');
    await query("UPDATE product_specifications SET field_key = NULL, group_name = NULL, is_highlight = FALSE");
    const before = await query('SELECT COUNT(*)::int AS n FROM products');
    const customer = await query("SELECT id FROM users WHERE role = 'customer' LIMIT 1");

    const out = run('seed-phase2.js');
    expect(out).toMatch(/spec templates: 6 set/);
    expect(out).toMatch(new RegExp(`product specs: ${PRODUCTS.length} mapped`));
    expect(out).toMatch(/banners: 6 inserted/);

    // Nothing else was touched.
    expect((await query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n).toBe(before.rows[0].n);
    expect((await query('SELECT id FROM users WHERE id = $1', [customer.rows[0].id])).rows).toHaveLength(1);

    const list = (await api.get('/api/v1/products?category=laptops&brand=apple').expect(200)).body.data;
    for (const p of list) expect(p.highlights.map((h) => h.label)).toEqual(KEY_SPECS);
    expect((await api.get('/api/v1/banners').expect(200)).body.data).toHaveLength(4);

    const again = run('seed-phase2.js');
    expect(again).toMatch(/0 set, 6 kept/);
    expect(again).toMatch(/0 mapped to template fields/);
    expect(again).toMatch(/banners: skipped/);
  });

  test('keeps an edited template unless --force, and maps specs with the stored template', async () => {
    await query(
      `UPDATE categories SET spec_template = '{"groups":[{"name":"Key","fields":[{"key":"ram","label":"Memory","type":"text","unit":null,"highlight":true,"filterable":false}]}]}'
        WHERE slug = 'tablets'`
    );
    expect(run('seed-phase2.js')).toMatch(/0 set, 6 kept/);
    const kept = await query("SELECT spec_template FROM categories WHERE slug = 'tablets'");
    expect(kept.rows[0].spec_template.groups[0].name).toBe('Key');

    expect(run('seed-phase2.js', {}, ['--force'])).toMatch(/6 set, 0 kept/);
    const forced = await query("SELECT spec_template FROM categories WHERE slug = 'tablets'");
    expect(forced.rows[0].spec_template.groups[0].name).toBe('Performance');
  });
});
