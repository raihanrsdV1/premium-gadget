const { api, query, resetDb, factories: f } = require('../helpers');
const settings = require('../../src/modules/settings/settings.service');
const { actors, stocked, past, future } = require('./_p3');

jest.mock('../../src/lib/revalidate', () => ({
  ...jest.requireActual('../../src/lib/revalidate'),
  revalidate: jest.fn(),
}));
const { revalidate } = require('../../src/lib/revalidate');

beforeEach(async () => {
  await resetDb();
  settings._clearCache();
  revalidate.mockClear();
});

const S = '/api/v1/search/suggest';
const M = '/api/v1/catalog/menu';

describe('GET /search/suggest', () => {
  test('shape: products (≤6), categories (≤4), brands (≤4), total; effective price; cache header', async () => {
    const apple = await f.brand({ name: 'Apple', slug: 'apple' });
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    await f.category({ name: 'Hidden Laptops', slug: 'hidden-laptops', is_active: false });
    await f.brand({ name: 'Applebee', slug: 'applebee', is_active: false });
    const mac = await stocked({ name: 'MacBook Air', brand_id: apple.id, category_id: laptops.id, price: 100000, compare_at_price: 120000 });
    await query(
      'UPDATE product_variants SET sale_price = 90000, sale_starts_at = $2, sale_ends_at = $3 WHERE id = $1',
      [mac.variant.id, past(1), future(1)]
    );
    await query("INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, 'https://cdn.example.com/mac.jpg', TRUE)", [mac.product.id]);
    await stocked({ name: 'MacBook Pro', brand_id: apple.id, category_id: laptops.id, quantity: 0 });
    for (let i = 0; i < 7; i += 1) await stocked({ name: `Laptop Stand ${i}` });
    await stocked({ name: 'Hidden Laptop', is_active: false });

    const res = await api.get(`${S}?q=lapt`).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const d = res.body.data;
    expect(Object.keys(d).sort()).toEqual(['brands', 'categories', 'products', 'total']);
    expect(d.products).toHaveLength(6);
    expect(d.total).toBe(7);
    expect(d.categories).toEqual([{ name: 'Laptops', slug: 'laptops' }]);
    expect(d.brands).toEqual([]);

    const mb = (await api.get(`${S}?q=macbook`).expect(200)).body.data;
    expect(mb.total).toBe(2);
    expect(mb.products.map((p) => p.name)).toEqual(['MacBook Air', 'MacBook Pro']);
    expect(mb.products[0]).toEqual({
      id: mac.product.id, name: 'MacBook Air', slug: mac.product.slug, image: 'https://cdn.example.com/mac.jpg',
      price: '90000.00', compare_at_price: '120000.00', in_stock: true,
    });
    expect(mb.products[1].in_stock).toBe(false);

    const br = (await api.get(`${S}?q=app`).expect(200)).body.data;
    expect(br.brands).toEqual([{ name: 'Apple', slug: 'apple', logo_url: null }]);
  });

  test('typos still match (trigram), and nothing is a clean empty result', async () => {
    await stocked({ name: 'ThinkPad X1 Carbon' });
    const typo = (await api.get(`${S}?q=thinkpd`).expect(200)).body.data;
    expect(typo.products.map((p) => p.name)).toEqual(['ThinkPad X1 Carbon']);
    expect((await api.get(`${S}?q=zzzzzz`).expect(200)).body.data).toEqual({ products: [], categories: [], brands: [], total: 0 });
  });

  test('LIKE wildcards in q are literal', async () => {
    await stocked({ name: 'Plain Laptop' });
    expect((await api.get(`${S}?q=%25%25`).expect(200)).body.data.total).toBe(0);
  });

  test('q is trimmed and must be 2-80 characters; arrays and a missing q are 400', async () => {
    for (const qs of ['', '?q=', '?q=a', '?q=%20a%20', `?q=${'x'.repeat(81)}`, '?q=ab&q=cd']) {
      const res = await api.get(`${S}${qs}`);
      expect([qs, res.status]).toEqual([qs, 400]);
    }
    await api.get(`${S}?q=%20ab%20`).expect(200);
    await api.get(`${S}?q=${'x'.repeat(80)}`).expect(200);
  });
});

describe('GET /catalog/menu', () => {
  test('top-level active categories by sort_order with children and subtree brands (≤8, by product count)', async () => {
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    const macs = await f.category({ name: 'MacBooks', slug: 'macbooks', parent_id: laptops.id });
    const gaming = await f.category({ name: 'Gaming', slug: 'gaming', parent_id: laptops.id });
    await f.category({ name: 'Old line', slug: 'old-line', parent_id: laptops.id, is_active: false });
    const audio = await f.category({ name: 'Audio', slug: 'audio' });
    await f.category({ name: 'Retired', slug: 'retired', is_active: false });
    await query("UPDATE categories SET sort_order = 1, icon_url = 'https://cdn.example.com/laptop.png' WHERE id = $1", [laptops.id]);
    await query('UPDATE categories SET sort_order = 0 WHERE id = $1', [audio.id]);
    await query('UPDATE categories SET sort_order = 1 WHERE id = $1', [macs.id]);
    await query('UPDATE categories SET sort_order = 2 WHERE id = $1', [gaming.id]);

    const apple = await f.brand({ name: 'Apple', slug: 'apple' });
    const asus = await f.brand({ name: 'Asus', slug: 'asus' });
    const dead = await f.brand({ name: 'Dead', slug: 'dead', is_active: false });
    await query("UPDATE brands SET logo_url = 'https://cdn.example.com/apple.png' WHERE id = $1", [apple.id]);
    await stocked({ name: 'Air', category_id: macs.id, brand_id: apple.id });
    await stocked({ name: 'Pro', category_id: macs.id, brand_id: apple.id });
    await stocked({ name: 'Rog', category_id: gaming.id, brand_id: asus.id });
    await stocked({ name: 'Own', category_id: laptops.id, brand_id: asus.id });
    await stocked({ name: 'Ghost', category_id: laptops.id, brand_id: dead.id });
    await stocked({ name: 'Inactive', category_id: gaming.id, brand_id: dead.id, is_active: false });
    await stocked({ name: 'Buds', category_id: audio.id, brand_id: apple.id });
    // conditions: used Air + refurbished Rog in the Laptops subtree; inactive/variantless ones don't count
    await query("UPDATE products SET condition = 'used' WHERE name IN ('Air')");
    await query("UPDATE products SET condition = 'refurbished' WHERE name = 'Rog'");
    await query("UPDATE products SET condition = 'open_box' WHERE name = 'Inactive'");

    const res = await api.get(M).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    const { categories } = res.body.data;
    expect(categories.map((c) => c.slug)).toEqual(['audio', 'laptops']);
    expect(categories[0]).toEqual({
      id: audio.id, name: 'Audio', slug: 'audio', image_url: null, children: [],
      brands: [{ name: 'Apple', slug: 'apple', logo_url: 'https://cdn.example.com/apple.png' }],
      conditions: [{ code: 'new', label: 'New', count: 1 }],
      products: expect.any(Array), // covered by its own test below
    });
    expect(categories[1]).toEqual({
      id: laptops.id, name: 'Laptops', slug: 'laptops', image_url: 'https://cdn.example.com/laptop.png',
      children: [{ name: 'MacBooks', slug: 'macbooks' }, { name: 'Gaming', slug: 'gaming' }],
      // Asus (2 products across the subtree) and Apple (2): ties by name; inactive brand is out
      brands: [{ name: 'Apple', slug: 'apple', logo_url: 'https://cdn.example.com/apple.png' }, { name: 'Asus', slug: 'asus', logo_url: null }],
      // enum order; subtree-wide; the inactive open-box product is not public
      conditions: [
        { code: 'new', label: 'New', count: 3 }, { code: 'used', label: 'Used', count: 1 },
        { code: 'refurbished', label: 'Refurbished', count: 1 },
      ],
      products: expect.any(Array),
    });
  });

  test('brands are capped at 8 and ordered by product count', async () => {
    const cat = await f.category({ name: 'Phones', slug: 'phones' });
    for (let i = 0; i < 10; i += 1) {
      const b = await f.brand({ name: `Brand ${String(i).padStart(2, '0')}`, slug: `brand-${i}` });
      for (let k = 0; k <= i; k += 1) await stocked({ category_id: cat.id, brand_id: b.id });
    }
    const brands = (await api.get(M).expect(200)).body.data.categories[0].brands;
    expect(brands).toHaveLength(8);
    expect(brands[0].slug).toBe('brand-9');
    expect(brands[7].slug).toBe('brand-2');
  });

  test('popular products (≤3 per category, subtree): in stock first, then featured, then newest', async () => {
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    const sub = await f.category({ name: 'Business', slug: 'business', parent_id: laptops.id });
    await stocked({ name: 'Old Plain', category_id: laptops.id, created_days_ago: 10 });
    await stocked({ name: 'Sold Out Featured', category_id: laptops.id, is_featured: true, quantity: 0 });
    await stocked({ name: 'Featured In Sub', category_id: sub.id, is_featured: true, created_days_ago: 20 });
    await stocked({ name: 'New Plain', category_id: laptops.id, price: 40000, compare_at_price: 45000 });
    await stocked({ name: 'Hidden', category_id: laptops.id, is_active: false });

    const [cat] = (await api.get(M).expect(200)).body.data.categories;
    expect(cat.products.map((p) => p.name)).toEqual(['Featured In Sub', 'New Plain', 'Old Plain']);
    expect(cat.products[1]).toEqual({
      name: 'New Plain', slug: expect.any(String), image: null, price: '40000.00', compare_at_price: '45000.00', in_stock: true,
    });
    expect(JSON.stringify(cat.products)).not.toMatch(/cost_price/);
  });

  test('empty catalog gives an empty list', async () => {
    expect((await api.get(M).expect(200)).body.data).toEqual({ categories: [] });
  });
});

describe('setting: announcement', () => {
  const url = '/api/v1/settings/announcement';
  const valid = { enabled: true, items: [{ text: 'Eid sale: up to 20% off', link: '/collections/hot-sale' }, { text: 'Free delivery in Chattogram', link: null }] };

  test('default is { enabled: false, items: [] } and is public', async () => {
    const res = await api.get('/api/v1/settings').expect(200);
    expect(res.body.data.announcement).toEqual({ enabled: false, items: [] });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  test('super admin saves it; public sees it; revalidates "settings"; audited', async () => {
    const a = await actors();
    const res = await api.put(url).set(a.sa).send(valid).expect(200);
    expect(res.body.data.value).toEqual(valid);
    expect((await api.get('/api/v1/settings').expect(200)).body.data.announcement).toEqual(valid);
    expect(revalidate).toHaveBeenCalledWith(['settings']);
    expect((await query("SELECT 1 FROM admin_audit_log WHERE action = 'settings.update'")).rowCount).toBe(1);
    // https links are fine; a missing link is null; a blank link clears to null
    const r2 = await api.put(url).set(a.sa).send({ enabled: true, items: [{ text: 'Visit', link: 'https://example.com/x' }, { text: 'Hi' }, { text: 'Blank', link: ' ' }] }).expect(200);
    expect(r2.body.data.value.items.map((i) => i.link)).toEqual(['https://example.com/x', null, null]);
  });

  test('authz: anonymous 401, customer 403, branch admin 403', async () => {
    const a = await actors();
    await api.put(url).send(valid).expect(401);
    await api.put(url).set(a.cust).send(valid).expect(403);
    await api.put(url).set(a.ba).send(valid).expect(403);
  });

  test.each([
    ['javascript: link', { enabled: true, items: [{ text: 'x', link: 'javascript:alert(1)' }] }],
    ['data: link', { enabled: true, items: [{ text: 'x', link: 'data:text/html,hi' }] }],
    ['plain http link', { enabled: true, items: [{ text: 'x', link: 'http://example.com' }] }],
    ['protocol-relative link', { enabled: true, items: [{ text: 'x', link: '//evil.example.com' }] }],
    ['backslash link', { enabled: true, items: [{ text: 'x', link: '/\\evil.example.com' }] }],
    ['relative link without slash', { enabled: true, items: [{ text: 'x', link: 'products' }] }],
    ['link with spaces', { enabled: true, items: [{ text: 'x', link: '/a b' }] }],
    ['empty text', { enabled: true, items: [{ text: '  ', link: null }] }],
    ['text over 160', { enabled: true, items: [{ text: 'x'.repeat(161), link: null }] }],
    ['more than 5 items', { enabled: true, items: Array.from({ length: 6 }, () => ({ text: 'x', link: null })) }],
    ['missing enabled', { items: [] }],
    ['enabled not boolean', { enabled: 'yes', items: [] }],
    ['items not an array', { enabled: true, items: 'x' }],
    ['unknown keys', { enabled: true, items: [], extra: 1 }],
    ['unknown item keys', { enabled: true, items: [{ text: 'x', link: null, color: 'red' }] }],
  ])('rejects %s with 400', async (_name, body) => {
    const a = await actors();
    await api.put(url).set(a.sa).send(body).expect(400);
    expect((await query("SELECT 1 FROM site_settings WHERE key = 'announcement'")).rowCount).toBe(0);
  });

  test('exactly 5 items and 160-character text are accepted; items may be omitted', async () => {
    const a = await actors();
    await api.put(url).set(a.sa).send({ enabled: true, items: Array.from({ length: 5 }, () => ({ text: 'x'.repeat(160), link: '/x' })) }).expect(200);
    const res = await api.put(url).set(a.sa).send({ enabled: false }).expect(200);
    expect(res.body.data.value).toEqual({ enabled: false, items: [] });
  });
});
