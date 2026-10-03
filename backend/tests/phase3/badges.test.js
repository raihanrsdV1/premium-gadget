const { api, query, resetDb } = require('../helpers');
const { pool } = require('../../src/config/database');
const { past, future, collection, addMembers, stocked } = require('./_p3');

beforeEach(resetDb);

const find = (rows, name) => rows.find((r) => r.name === name);

describe('badges and low_stock on public product rows', () => {
  test('manual live collection with a badge_label; newest collection by product age', async () => {
    const hot = await collection({ slug: 'hot', name: 'Hot Sale', badge_label: 'Hot', badge_tone: 'coral', home_sort_order: 0 });
    await collection({ slug: 'fresh', name: 'New Arrivals', source: 'newest', source_days: 30, badge_label: 'New', badge_tone: 'blue', home_sort_order: 1 });
    const fresh = await stocked({ name: 'Fresh' });
    const old = await stocked({ name: 'Old', created_days_ago: 90 });
    const oldHot = await stocked({ name: 'OldHot', created_days_ago: 90 });
    await addMembers(hot.id, [oldHot.product.id, fresh.product.id]);

    const rows = (await api.get('/api/v1/products').expect(200)).body.data;
    expect(find(rows, 'Fresh').badges).toEqual([
      { label: 'Hot', tone: 'coral', slug: 'hot' },
      { label: 'New', tone: 'blue', slug: 'fresh' },
    ]);
    expect(find(rows, 'OldHot').badges).toEqual([{ label: 'Hot', tone: 'coral', slug: 'hot' }]);
    expect(find(rows, 'Old').badges).toEqual([]);
  });

  test('at most 2, ordered by home_sort_order; collections without a label, non-live and auto non-newest give none', async () => {
    const mk = (slug, order, extra = {}) => collection({ slug, name: slug, badge_label: slug.toUpperCase(), home_sort_order: order, ...extra });
    const c3 = await mk('c3', 3);
    const c1 = await mk('c1', 1);
    const c2 = await mk('c2', 2);
    const noLabel = await collection({ slug: 'plain', badge_label: null, home_sort_order: 0 });
    const off = await mk('off', 0, { is_active: false });
    const later = await mk('later', 0, { starts_at: future(1) });
    const over = await mk('over', 0, { starts_at: past(4), ends_at: past(1) });
    const best = await mk('best', 0, { source: 'best_selling' });
    const { product } = await stocked({ name: 'P' });
    for (const c of [c3, c1, c2, noLabel, off, later, over]) await addMembers(c.id, [product.id]);
    await query('INSERT INTO collection_products (collection_id, product_id) VALUES ($1, $2)', [best.id, product.id]);

    const rows = (await api.get('/api/v1/products').expect(200)).body.data;
    expect(rows[0].badges.map((b) => b.slug)).toEqual(['c1', 'c2']);
  });

  test('present on featured, search, detail and collection products', async () => {
    const hot = await collection({ slug: 'hot', badge_label: 'Hot', badge_tone: 'amber' });
    const { product } = await stocked({ name: 'Zenbook', is_featured: true });
    await addMembers(hot.id, [product.id]);
    const badge = [{ label: 'Hot', tone: 'amber', slug: 'hot' }];

    expect((await api.get('/api/v1/products/featured').expect(200)).body.data[0].badges).toEqual(badge);
    expect((await api.get('/api/v1/products/search?q=Zenbook').expect(200)).body.data[0].badges).toEqual(badge);
    expect((await api.get(`/api/v1/products/${product.slug}`).expect(200)).body.data.badges).toEqual(badge);
    expect((await api.get('/api/v1/collections/hot').expect(200)).body.products[0].badges).toEqual(badge);
  });

  test('low_stock is true when 1-3 are available in total, across active variants and branches', async () => {
    const mk = (name, quantity, reserved = 0) => stocked({ name, quantity }).then(async (r) => {
      if (reserved) await query('UPDATE inventory SET reserved = $2 WHERE variant_id = $1', [r.variant.id, reserved]);
      return r;
    });
    await mk('Zero', 0);
    await mk('One', 1);
    await mk('Three', 3);
    await mk('Four', 4);
    await mk('Reserved', 5, 3); // 2 available
    const rows = (await api.get('/api/v1/products?limit=50').expect(200)).body.data;
    expect(Object.fromEntries(rows.map((r) => [r.name, r.low_stock]))).toEqual({
      Zero: false, One: true, Three: true, Four: false, Reserved: true,
    });
    const one = rows.find((r) => r.name === 'One');
    expect((await api.get(`/api/v1/products/${one.slug}`).expect(200)).body.data.low_stock).toBe(true);
    const four = rows.find((r) => r.name === 'Four');
    expect((await api.get(`/api/v1/products/${four.slug}`).expect(200)).body.data.low_stock).toBe(false);
  });

  test('batched: one badge query per list, not one per row (no N+1)', async () => {
    const hot = await collection({ slug: 'hot', badge_label: 'Hot' });
    const ids = [];
    for (let i = 0; i < 8; i += 1) ids.push((await stocked({ name: `Item ${i}`, is_featured: true })).product.id);
    await addMembers(hot.id, ids);

    const spy = jest.spyOn(pool, 'query');
    const badgeQueries = () => spy.mock.calls.filter(([sql]) => /CROSS JOIN collections/.test(typeof sql === 'string' ? sql : sql?.text || '')).length;
    try {
      for (const url of ['/api/v1/products?limit=50', '/api/v1/products/featured?limit=8', '/api/v1/products/search?q=Item&limit=50', '/api/v1/collections/hot']) {
        spy.mockClear();
        const res = await api.get(url).expect(200);
        const rows = res.body.data?.collection ? res.body.products : res.body.data;
        expect(rows).toHaveLength(8);
        expect(rows.every((r) => r.badges.length === 1)).toBe(true);
        expect([url, badgeQueries()]).toEqual([url, 1]);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
