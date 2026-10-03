const { execFileSync } = require('child_process');
const path = require('path');
const { api, resetDb, query } = require('../helpers');

const script = (name) => path.join(__dirname, '..', '..', 'scripts', name);
const run = (name, env = {}, args = []) =>
  execFileSync('node', [script(name), ...args], {
    env: { ...process.env, NODE_ENV: 'development', ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const members = async (slug) =>
  (await query(
    `SELECT cp.product_id FROM collection_products cp JOIN collections c ON c.id = cp.collection_id
      WHERE c.slug = $1 ORDER BY cp.sort_order`, [slug]
  )).rows.map((r) => r.product_id);

beforeAll(async () => {
  await resetDb();
  run('seed.js'); // wipes every table, default collections included
});

describe('scripts/seed-phase3.js', () => {
  test('refuses to run in production without --allow-production', () => {
    expect(() => run('seed-phase3.js', { NODE_ENV: 'production' })).toThrow();
  });

  test('restores the defaults, adds 6 demo products each to Hot Sale and Trending, and is idempotent', async () => {
    expect((await query('SELECT 1 FROM collections')).rowCount).toBe(0);
    const out = run('seed-phase3.js');
    expect(out).toMatch(/hot-sale: 6 product/);
    expect((await query("SELECT slug FROM collections WHERE slug <> 'gaming-laptops' ORDER BY home_sort_order")).rows.map((r) => r.slug))
      .toEqual(['hot-sale', 'new-arrivals', 'trending', 'best-sellers', 'deals']);
    const hot = await members('hot-sale');
    const trending = await members('trending');
    expect(hot).toHaveLength(6);
    expect(trending).toHaveLength(6);
    expect(new Set(hot).size).toBe(6);

    const second = run('seed-phase3.js');
    expect(second).toMatch(/already has 6/);
    expect(await members('hot-sale')).toEqual(hot);
    expect(await members('trending')).toEqual(trending);

    const home = (await api.get('/api/v1/collections?home=true').expect(200)).body.data;
    expect(home.map((c) => c.slug)).toEqual(expect.arrayContaining(['hot-sale', 'new-arrivals', 'trending']));
    expect(home.find((c) => c.slug === 'hot-sale').products).toHaveLength(6);
    // every hot-sale product carries the "Hot" badge
    expect(home.find((c) => c.slug === 'hot-sale').products.every((p) => p.badges.some((b) => b.slug === 'hot-sale'))).toBe(true);
  });

  test('creates the manual Gaming Laptops collection with the seeded gaming laptops, idempotently', async () => {
    const col = (await query("SELECT * FROM collections WHERE slug = 'gaming-laptops'")).rows[0];
    expect(col).toMatchObject({ name: 'Gaming Laptops', source: 'manual', show_on_home: false, home_layout: 'grid', badge_label: null });
    const names = async () => (await query(
      `SELECT p.name FROM collection_products cp JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = $1 ORDER BY p.name`, [col.id])).rows.map((r) => r.name);
    const expected = [
      'ASUS ROG Strix G15 RTX 3060 (Used)', 'Lenovo Legion 5 RTX 3060 (Used)', 'MSI Thin GF63 12UCX RTX 2050 (New)',
    ].sort();
    expect(await names()).toEqual(expected);
    run('seed-phase3.js');
    expect(await names()).toEqual(expected);
    expect((await query("SELECT 1 FROM categories WHERE slug IN ('gaming-laptops','used-laptops','new-laptops','macbooks')")).rowCount).toBe(0);
  });

  test('leaves a curated collection alone', async () => {
    await query("DELETE FROM collection_products WHERE collection_id = (SELECT id FROM collections WHERE slug = 'trending')");
    await query("DELETE FROM collection_products WHERE collection_id = (SELECT id FROM collections WHERE slug = 'hot-sale') AND sort_order > 0");
    run('seed-phase3.js');
    expect(await members('hot-sale')).toHaveLength(1);
    expect(await members('trending')).toHaveLength(6);
  });
});
