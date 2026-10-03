const fs = require('fs');
const path = require('path');
const { api, query, resetDb, factories: f } = require('../helpers');
const { past, future, collection, addMembers, stocked, sell, actors } = require('./_p3');

jest.mock('../../src/lib/revalidate', () => ({
  ...jest.requireActual('../../src/lib/revalidate'),
  revalidate: jest.fn(),
}));
const { revalidate } = require('../../src/lib/revalidate');

beforeEach(async () => {
  await resetDb();
  revalidate.mockClear();
});

const C = '/api/v1/collections';
const names = (res) => res.body.data.map((p) => p.name);
const tagsSent = () => revalidate.mock.calls.map(([t]) => t);

describe('migration 010', () => {
  test('is idempotent and seeds the five default collections in order', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'migrations', '010_collections.sql'), 'utf8');
    await query(sql);
    await query(sql);
    const { rows } = await query('SELECT slug, source, source_days, badge_label, badge_tone, home_layout, show_on_home FROM collections ORDER BY home_sort_order');
    expect(rows).toEqual([
      { slug: 'hot-sale', source: 'manual', source_days: null, badge_label: 'Hot', badge_tone: 'coral', home_layout: 'carousel', show_on_home: true },
      { slug: 'new-arrivals', source: 'newest', source_days: 30, badge_label: 'Just in', badge_tone: 'blue', home_layout: 'carousel', show_on_home: true },
      { slug: 'trending', source: 'manual', source_days: null, badge_label: 'Trending', badge_tone: 'amber', home_layout: 'carousel', show_on_home: true },
      { slug: 'best-sellers', source: 'best_selling', source_days: 30, badge_label: 'Top selling', badge_tone: 'green', home_layout: 'grid', show_on_home: true },
      { slug: 'deals', source: 'on_sale', source_days: null, badge_label: null, badge_tone: 'coral', home_layout: 'grid', show_on_home: true },
    ]);
  });

  test('database constraints reject bad values', async () => {
    await expect(collection({ badge_tone: 'pink' })).rejects.toThrow();
    await expect(collection({ source: 'random' })).rejects.toThrow();
    await expect(collection({ home_limit: 25 })).rejects.toThrow();
    await expect(collection({ source_days: 400 })).rejects.toThrow();
    await expect(collection({ starts_at: future(3), ends_at: future(1) })).rejects.toThrow();
  });
});

describe('GET /collections (public, live rules)', () => {
  test('lists only live collections, with the public shape', async () => {
    await collection({ slug: 'live', name: 'Live', home_sort_order: 0 });
    await collection({ slug: 'window', name: 'Window', starts_at: past(1), ends_at: future(1), home_sort_order: 1 });
    await collection({ slug: 'off', is_active: false });
    await collection({ slug: 'later', starts_at: future(1) });
    await collection({ slug: 'over', starts_at: past(5), ends_at: past(1) });

    const res = await api.get(C).expect(200);
    expect(res.body.data.map((c) => c.slug)).toEqual(['live', 'window']);
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'badge_label', 'badge_tone', 'banner_url', 'description', 'ends_at', 'home_layout', 'id', 'name', 'slug', 'source', 'starts_at',
    ]);
  });

  test('GET /collections/:slug is 404 unless live; live returns collection + products + pagination', async () => {
    await collection({ slug: 'off', is_active: false });
    await collection({ slug: 'later', starts_at: future(1) });
    await collection({ slug: 'over', starts_at: past(5), ends_at: past(1) });
    for (const slug of ['off', 'later', 'over', 'missing']) await api.get(`${C}/${slug}`).expect(404);

    const { product } = await stocked({ name: 'Alpha' });
    const col = await collection({ slug: 'picks', meta_title: 'Picks', meta_description: 'Our picks' });
    await addMembers(col.id, [product.id]);
    const res = await api.get(`${C}/picks`).expect(200);
    expect(res.body.collection).toMatchObject({ slug: 'picks', meta_title: 'Picks', meta_description: 'Our picks' });
    expect(res.body.data.collection.slug).toBe('picks');
    expect(res.body.products.map((p) => p.name)).toEqual(['Alpha']);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
    expect(res.body.products[0]).toEqual(expect.objectContaining({ highlights: [], badges: [], low_stock: false }));
  });

  test('manual products are public ones only: inactive and deleted are hidden', async () => {
    const a = await stocked({ name: 'A' });
    const hidden = await stocked({ name: 'Hidden', is_active: false });
    const gone = await stocked({ name: 'Gone' });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [gone.product.id]);
    const col = await collection({ slug: 'picks' });
    await addMembers(col.id, [hidden.product.id, gone.product.id, a.product.id]);
    expect(names(await api.get(`${C}/picks`).expect(200).then((r) => ({ body: { data: r.body.products } })))).toEqual(['A']);
  });

  test('query validation: bad sort, array and out-of-range paging are 400', async () => {
    await collection({ slug: 'picks' });
    for (const qs of ['sort=cheapest', 'sort=price_asc&sort=newest', 'page=0', 'limit=101', 'page=1&page=2']) {
      await api.get(`${C}/picks?${qs}`).expect(400);
    }
    await api.get(`${C}?home=maybe`).expect(400);
    await api.get(`${C}?home=true&home=false`).expect(400);
  });
});

describe('source orderings', () => {
  const productNames = async (slug, qs = '') => (await api.get(`${C}/${slug}${qs}`).expect(200)).body.products.map((p) => p.name);

  test('manual: collection_products.sort_order', async () => {
    const [a, b, c] = [await stocked({ name: 'A' }), await stocked({ name: 'B' }), await stocked({ name: 'C' })];
    const col = await collection({ slug: 'm' });
    await addMembers(col.id, [c.product.id, a.product.id, b.product.id]);
    expect(await productNames('m')).toEqual(['C', 'A', 'B']);
  });

  test('newest: created within the window, newest first; source_days defaults to 30', async () => {
    await stocked({ name: 'Old', created_days_ago: 60 });
    await stocked({ name: 'Week', created_days_ago: 7 });
    await stocked({ name: 'Today' });
    await collection({ slug: 'n30', source: 'newest' });
    await collection({ slug: 'n3', source: 'newest', source_days: 3 });
    await collection({ slug: 'n90', source: 'newest', source_days: 90 });
    expect(await productNames('n30')).toEqual(['Today', 'Week']);
    expect(await productNames('n3')).toEqual(['Today']);
    expect(await productNames('n90')).toEqual(['Today', 'Week', 'Old']);
  });

  test('on_sale: live sales only, biggest % off first', async () => {
    const small = await stocked({ name: 'Small', price: 10000 });
    const big = await stocked({ name: 'Big', price: 10000 });
    const ended = await stocked({ name: 'Ended', price: 10000 });
    const future_ = await stocked({ name: 'Future', price: 10000 });
    await stocked({ name: 'Regular' });
    const sale = (v, price, s, e) => query('UPDATE product_variants SET sale_price = $2, sale_starts_at = $3, sale_ends_at = $4 WHERE id = $1', [v.id, price, s, e]);
    await sale(small.variant, 9000, past(), future());
    await sale(big.variant, 5000, null, null);
    await sale(ended.variant, 1000, past(5), past(1));
    await sale(future_.variant, 1000, future(1), future(3));
    await collection({ slug: 'deals', source: 'on_sale' });
    expect(await productNames('deals')).toEqual(['Big', 'Small']);
  });

  test('best_selling: units in the window; cancelled/returned orders and voided POS sales do not count', async () => {
    const top = await stocked({ name: 'Top' });
    const mid = await stocked({ name: 'Mid' });
    const low = await stocked({ name: 'Low' });
    const noisy = await stocked({ name: 'Noisy' });
    const old = await stocked({ name: 'Old' });
    await stocked({ name: 'NeverSold' });

    await sell({ variant: top.variant, qty: 2 });
    await sell({ variant: top.variant, qty: 2, channel: 'pos' }); // POS sale counts: 4 units
    await sell({ variant: mid.variant, qty: 3 });
    await sell({ variant: low.variant, qty: 2 });
    await sell({ variant: noisy.variant, qty: 50, status: 'cancelled' });
    await sell({ variant: noisy.variant, qty: 50, status: 'returned' });
    await sell({ variant: noisy.variant, qty: 50, channel: 'pos', voided: true });
    await sell({ variant: noisy.variant, qty: 1 });
    await sell({ variant: old.variant, qty: 99, daysAgo: 40 });
    await collection({ slug: 'best', source: 'best_selling' });
    await collection({ slug: 'best-60', source: 'best_selling', source_days: 60 });

    expect(await productNames('best')).toEqual(['Top', 'Mid', 'Low', 'Noisy']);
    expect(await productNames('best-60')).toEqual(['Old', 'Top', 'Mid', 'Low', 'Noisy']);
  });

  test('featured: is_featured by sort_order', async () => {
    const a = await stocked({ name: 'A', is_featured: true });
    const b = await stocked({ name: 'B', is_featured: true });
    await stocked({ name: 'C' });
    await query('UPDATE products SET sort_order = 5 WHERE id = $1', [a.product.id]);
    await query('UPDATE products SET sort_order = 1 WHERE id = $1', [b.product.id]);
    await collection({ slug: 'feat', source: 'featured' });
    expect(await productNames('feat')).toEqual(['B', 'A']);
  });

  test('?sort overrides the source order', async () => {
    const cheap = await stocked({ name: 'Cheap', price: 1000 });
    const dear = await stocked({ name: 'Dear', price: 9000 });
    const col = await collection({ slug: 'm' });
    await addMembers(col.id, [dear.product.id, cheap.product.id]);
    expect(await productNames('m')).toEqual(['Dear', 'Cheap']);
    expect(await productNames('m', '?sort=price_asc')).toEqual(['Cheap', 'Dear']);
    expect(await productNames('m', '?sort=price_desc')).toEqual(['Dear', 'Cheap']);
  });

  test('pagination', async () => {
    const col = await collection({ slug: 'm' });
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push((await stocked({ name: `P${i}` })).product.id);
    await addMembers(col.id, ids);
    const res = await api.get(`${C}/m?page=2&limit=2`).expect(200);
    expect(res.body.products.map((p) => p.name)).toEqual(['P2', 'P3']);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3, hasNext: true, hasPrev: true });
  });
});

describe('GET /collections?home=true', () => {
  test('home collections by home_sort_order with products; empty and not-home ones are left out; cached', async () => {
    const [a, b, c] = [await stocked({ name: 'A' }), await stocked({ name: 'B' }), await stocked({ name: 'C' })];
    const second = await collection({ slug: 'second', show_on_home: true, home_sort_order: 2, home_limit: 2 });
    const first = await collection({ slug: 'first', show_on_home: true, home_sort_order: 1 });
    await collection({ slug: 'empty', show_on_home: true, home_sort_order: 0 });
    const hidden = await collection({ slug: 'hidden', show_on_home: false, home_sort_order: 0 });
    await collection({ slug: 'offline', show_on_home: true, is_active: false, home_sort_order: 0 });
    await addMembers(first.id, [a.product.id]);
    await addMembers(second.id, [a.product.id, b.product.id, c.product.id]);
    await addMembers(hidden.id, [a.product.id]);

    const res = await api.get(`${C}?home=true`).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.body.data.map((x) => x.slug)).toEqual(['first', 'second']);
    expect(res.body.data[1].products.map((p) => p.name)).toEqual(['A', 'B']); // home_limit 2
    expect(res.body.data[0].products[0]).toEqual(expect.objectContaining({
      id: a.product.id, slug: a.product.slug, price: '50000.00', in_stock: true, highlights: [], badges: [], low_stock: false,
    }));
    // The plain list does not embed products and sets no cache header.
    const plain = await api.get(C).expect(200);
    expect(plain.body.data[0].products).toBeUndefined();
  });
});

describe('admin reads', () => {
  test('authz: anonymous 401, customer 403, staff and super admin OK', async () => {
    const a = await actors();
    const col = await collection();
    for (const url of [`${C}/admin`, `${C}/admin/${col.id}`]) {
      await api.get(url).expect(401);
      await api.get(url).set(a.cust).expect(403);
      await api.get(url).set(a.ba).expect(200);
      await api.get(url).set(a.sa).expect(200);
    }
    await api.get(`${C}/admin/not-a-uuid`).set(a.sa).expect(400);
    await api.get(`${C}/admin/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`).set(a.sa).expect(404);
  });

  test('list: status live / scheduled / ended / off and product_count', async () => {
    const a = await actors();
    const p1 = await stocked({ name: 'A' });
    const p2 = await stocked({ name: 'B', is_active: false });
    const live = await collection({ slug: 'live', home_sort_order: 0 });
    await collection({ slug: 'later', starts_at: future(1), home_sort_order: 1 });
    await collection({ slug: 'over', starts_at: past(4), ends_at: past(1), home_sort_order: 2 });
    await collection({ slug: 'off', is_active: false, home_sort_order: 3 });
    await collection({ slug: 'feat', source: 'featured', home_sort_order: 4 });
    await addMembers(live.id, [p1.product.id, p2.product.id]);
    await query('UPDATE products SET is_featured = TRUE WHERE id = $1', [p1.product.id]);

    const res = await api.get(`${C}/admin`).set(a.ba).expect(200);
    expect(res.body.data.map((c) => [c.slug, c.status, c.product_count])).toEqual([
      ['live', 'live', 2], ['later', 'scheduled', 0], ['over', 'ended', 0], ['off', 'off', 0], ['feat', 'live', 1],
    ]);
  });

  test('detail: manual lists members in order (inactive flagged); auto sources show computed products', async () => {
    const a = await actors();
    const p1 = await stocked({ name: 'A', price: 1000 });
    const p2 = await stocked({ name: 'B', is_active: false, price: 2000 });
    await query("INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, 'https://cdn.example.com/a.jpg', TRUE)", [p1.product.id]);
    const man = await collection({ slug: 'man' });
    await addMembers(man.id, [p2.product.id, p1.product.id]);
    const res = await api.get(`${C}/admin/${man.id}`).set(a.ba).expect(200);
    expect(res.body.data).toMatchObject({ slug: 'man', status: 'live', product_count: 2 });
    expect(res.body.data.products).toEqual([
      { id: p2.product.id, name: 'B', slug: p2.product.slug, image: null, min_price: '2000.00', is_active: false },
      { id: p1.product.id, name: 'A', slug: p1.product.slug, image: 'https://cdn.example.com/a.jpg', min_price: '1000.00', is_active: true },
    ]);

    const auto = await collection({ slug: 'auto', source: 'newest' });
    const r2 = await api.get(`${C}/admin/${auto.id}`).set(a.sa).expect(200);
    expect(r2.body.data.products.map((p) => p.name)).toEqual(['A']); // B is inactive, so not public
  });
});

describe('writes (super admin only)', () => {
  const body = (o = {}) => ({ name: 'Eid Offers', badge_label: 'Eid', badge_tone: 'green', ...o });

  test('POST authz matrix; audited; revalidates collections, products and collection:<slug>', async () => {
    const a = await actors();
    await api.post(C).send(body()).expect(401);
    await api.post(C).set(a.cust).send(body()).expect(403);
    await api.post(C).set(a.ba).send(body()).expect(403);
    expect(revalidate).not.toHaveBeenCalled();

    const res = await api.post(C).set(a.sa).send(body()).expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Eid Offers', slug: 'eid-offers', source: 'manual', source_days: null, badge_label: 'Eid', badge_tone: 'green',
      show_on_home: false, home_limit: 10, home_layout: 'carousel', is_active: true, status: 'live', products: [], product_count: 0,
    });
    expect(tagsSent()).toEqual([['collections', 'products', 'collection:eid-offers']]);
    const log = await query("SELECT actor_id, entity_id FROM admin_audit_log WHERE action = 'collection.create'");
    expect(log.rows).toEqual([{ actor_id: a.users.sa.id, entity_id: res.body.data.id }]);
  });

  test('POST: slug derived from the name and made unique; explicit duplicate 409; reserved slug 400', async () => {
    const a = await actors();
    const one = await api.post(C).set(a.sa).send(body()).expect(201);
    const two = await api.post(C).set(a.sa).send(body()).expect(201);
    expect([one.body.data.slug, two.body.data.slug]).toEqual(['eid-offers', 'eid-offers-2']);
    await api.post(C).set(a.sa).send(body({ slug: 'eid-offers' })).expect(409);
    await api.post(C).set(a.sa).send(body({ slug: 'admin' })).expect(400);
    await api.post(C).set(a.sa).send(body({ slug: 'home-order' })).expect(400);
    await api.post(C).set(a.sa).send(body({ name: 'Mine', slug: 'my-own' })).expect(201);
  });

  test('POST: new collections go to the end of the home order', async () => {
    const a = await actors();
    await collection({ home_sort_order: 4 });
    const res = await api.post(C).set(a.sa).send(body()).expect(201);
    expect(res.body.data.home_sort_order).toBe(5);
  });

  test('validation rejects', async () => {
    const a = await actors();
    const bad = [
      {}, { name: '' }, { name: 'x'.repeat(81) }, { name: ['a'] },
      body({ badge_tone: 'pink' }), body({ badge_label: 'x'.repeat(25) }),
      body({ source: 'random' }), body({ source: 'newest', source_days: 0 }), body({ source: 'newest', source_days: 366 }),
      body({ home_limit: 0 }), body({ home_limit: 25 }), body({ home_layout: 'masonry' }),
      body({ home_layout: 'countdown' }), // needs ends_at
      body({ starts_at: future(3), ends_at: future(1) }), body({ starts_at: 'tomorrow' }),
      body({ slug: 'Bad Slug' }), body({ banner_url: 'javascript:alert(1)' }), body({ is_active: 'yes' }),
      body({ meta_title: 'x'.repeat(121) }), body({ meta_description: 'x'.repeat(321) }),
    ];
    for (const b of bad) {
      const res = await api.post(C).set(a.sa).send(b);
      expect([JSON.stringify(b).slice(0, 80), res.status]).toEqual([JSON.stringify(b).slice(0, 80), 400]);
    }
    // countdown with ends_at is fine
    await api.post(C).set(a.sa).send(body({ home_layout: 'countdown', ends_at: future(2) })).expect(201);
  });

  test('source_days only applies to newest and best_selling', async () => {
    const a = await actors();
    const man = await api.post(C).set(a.sa).send(body({ source_days: 14 })).expect(201);
    expect(man.body.data.source_days).toBeNull();
    const newest = await api.post(C).set(a.sa).send(body({ name: 'N', source: 'newest', source_days: 14 })).expect(201);
    expect(newest.body.data.source_days).toBe(14);
    // switching to on_sale clears the window
    const upd = await api.put(`${C}/${newest.body.data.id}`).set(a.sa).send({ source: 'on_sale' }).expect(200);
    expect(upd.body.data.source_days).toBeNull();
  });

  test('PUT: authz, partial update checked on the merged state, slug change, 404', async () => {
    const a = await actors();
    const col = await collection({ slug: 'old-slug', home_layout: 'countdown', ends_at: future(2) });
    const url = `${C}/${col.id}`;
    await api.put(url).send({ name: 'X' }).expect(401);
    await api.put(url).set(a.cust).send({ name: 'X' }).expect(403);
    await api.put(url).set(a.ba).send({ name: 'X' }).expect(403);
    await api.put(url).set(a.sa).send({}).expect(400);
    // removing ends_at while the layout is countdown breaks the rule
    await api.put(url).set(a.sa).send({ ends_at: null }).expect(400);
    // an end before the stored start
    await query('UPDATE collections SET starts_at = $2 WHERE id = $1', [col.id, past(1)]);
    await api.put(url).set(a.sa).send({ ends_at: past(3) }).expect(400);
    const ok = await api.put(url).set(a.sa).send({ name: 'Renamed', slug: 'new-slug', home_layout: 'grid', ends_at: null }).expect(200);
    expect(ok.body.data).toMatchObject({ name: 'Renamed', slug: 'new-slug', home_layout: 'grid', ends_at: null });
    // both the old and the new page are refreshed
    expect(tagsSent().pop()).toEqual(expect.arrayContaining(['collections', 'products', 'collection:old-slug', 'collection:new-slug']));
    await collection({ slug: 'taken' });
    await api.put(url).set(a.sa).send({ slug: 'taken' }).expect(409);
    await api.put(`${C}/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`).set(a.sa).send({ name: 'X' }).expect(404);
    expect(await query("SELECT 1 FROM admin_audit_log WHERE action = 'collection.update'")).toHaveProperty('rowCount', 1);
  });

  test('DELETE: super admin only; memberships cascade; audited; revalidates', async () => {
    const a = await actors();
    const { product } = await stocked();
    const col = await collection({ slug: 'bye' });
    await addMembers(col.id, [product.id]);
    await api.delete(`${C}/${col.id}`).expect(401);
    await api.delete(`${C}/${col.id}`).set(a.cust).expect(403);
    await api.delete(`${C}/${col.id}`).set(a.ba).expect(403);
    await api.delete(`${C}/${col.id}`).set(a.sa).expect(200);
    expect((await query('SELECT 1 FROM collection_products')).rowCount).toBe(0);
    expect((await query("SELECT 1 FROM products WHERE id = $1", [product.id])).rowCount).toBe(1);
    expect(tagsSent()).toEqual([['collections', 'products', 'collection:bye']]);
    expect((await query("SELECT 1 FROM admin_audit_log WHERE action = 'collection.delete'")).rowCount).toBe(1);
    await api.delete(`${C}/${col.id}`).set(a.sa).expect(404);
  });
});

describe('PUT /collections/:id/products', () => {
  test('replaces the ordered list; authz; audited; revalidates', async () => {
    const a = await actors();
    const [p1, p2, p3] = [await stocked({ name: 'A' }), await stocked({ name: 'B' }), await stocked({ name: 'C' })];
    const col = await collection({ slug: 'picks' });
    const url = `${C}/${col.id}/products`;
    await api.put(url).send({ product_ids: [] }).expect(401);
    await api.put(url).set(a.cust).send({ product_ids: [] }).expect(403);
    await api.put(url).set(a.ba).send({ product_ids: [] }).expect(403);

    const r1 = await api.put(url).set(a.sa).send({ product_ids: [p1.product.id, p2.product.id, p3.product.id] }).expect(200);
    expect(r1.body.data.products.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    const r2 = await api.put(url).set(a.sa).send({ product_ids: [p3.product.id, p1.product.id] }).expect(200);
    expect(r2.body.data.products.map((p) => p.name)).toEqual(['C', 'A']);
    const { rows } = await query('SELECT product_id, sort_order FROM collection_products ORDER BY sort_order');
    expect(rows).toEqual([{ product_id: p3.product.id, sort_order: 0 }, { product_id: p1.product.id, sort_order: 1 }]);
    expect(tagsSent().pop()).toEqual(['collections', 'products', 'collection:picks']);
    await api.put(url).set(a.sa).send({ product_ids: [] }).expect(200);
    expect((await query('SELECT 1 FROM collection_products')).rowCount).toBe(0);
    expect((await query("SELECT 1 FROM admin_audit_log WHERE action = 'collection.products'")).rowCount).toBe(3);
  });

  test('auto collections are 409 "fills itself automatically"', async () => {
    const a = await actors();
    const { product } = await stocked();
    for (const source of ['newest', 'on_sale', 'best_selling', 'featured']) {
      const col = await collection({ source });
      const res = await api.put(`${C}/${col.id}/products`).set(a.sa).send({ product_ids: [product.id] }).expect(409);
      expect(res.body.message).toBe('This collection fills itself automatically');
    }
  });

  test('validation: unknown / deleted products 400, duplicates 400, over 200 400, non-uuid 400', async () => {
    const a = await actors();
    const { product } = await stocked();
    const gone = await stocked();
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [gone.product.id]);
    const col = await collection();
    const url = `${C}/${col.id}/products`;
    const ghost = '11111111-1111-4111-8111-111111111111';
    await api.put(url).set(a.sa).send({ product_ids: [ghost] }).expect(400);
    await api.put(url).set(a.sa).send({ product_ids: [product.id, gone.product.id] }).expect(400);
    await api.put(url).set(a.sa).send({ product_ids: [product.id, product.id] }).expect(400);
    await api.put(url).set(a.sa).send({ product_ids: Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }).expect(400);
    await api.put(url).set(a.sa).send({ product_ids: ['nope'] }).expect(400);
    await api.put(url).set(a.sa).send({ product_ids: product.id }).expect(400);
    await api.put(url).set(a.sa).send({}).expect(400);
    expect((await query('SELECT 1 FROM collection_products')).rowCount).toBe(0); // nothing half-applied
  });
});

describe('PUT /collections/home-order', () => {
  test('sets home_sort_order to the array index; authz; unknown ids 400', async () => {
    const a = await actors();
    const [c1, c2, c3] = [await collection(), await collection(), await collection()];
    await api.put(`${C}/home-order`).send({ ids: [c1.id] }).expect(401);
    await api.put(`${C}/home-order`).set(a.ba).send({ ids: [c1.id] }).expect(403);
    const res = await api.put(`${C}/home-order`).set(a.sa).send({ ids: [c3.id, c1.id, c2.id] }).expect(200);
    expect(res.body.data.map((c) => [c.id, c.home_sort_order])).toEqual([[c3.id, 0], [c1.id, 1], [c2.id, 2]]);
    expect(tagsSent().pop()).toEqual(expect.arrayContaining(['collections', 'products']));
    await api.put(`${C}/home-order`).set(a.sa).send({ ids: [c1.id, '11111111-1111-4111-8111-111111111111'] }).expect(400);
    await api.put(`${C}/home-order`).set(a.sa).send({ ids: [c1.id, c1.id] }).expect(400);
    await api.put(`${C}/home-order`).set(a.sa).send({ ids: [] }).expect(400);
    await api.put(`${C}/home-order`).set(a.sa).send({ ids: 'x' }).expect(400);
  });
});

describe('product side: collections of a product', () => {
  test('GET /products/admin/:id lists manual memberships; PUT /products/:id/collections replaces them', async () => {
    const a = await actors();
    const { product } = await stocked();
    const [c1, c2, c3] = [await collection({ name: 'One', home_sort_order: 0 }), await collection({ name: 'Two', home_sort_order: 1 }), await collection({ name: 'Three', home_sort_order: 2 })];
    const other = await stocked();
    await addMembers(c2.id, [other.product.id]);
    const url = `/api/v1/products/${product.id}/collections`;

    await api.put(url).send({ collection_ids: [] }).expect(401);
    await api.put(url).set(a.cust).send({ collection_ids: [] }).expect(403);
    await api.put(url).set(a.ba).send({ collection_ids: [] }).expect(403);

    const r1 = await api.put(url).set(a.sa).send({ collection_ids: [c1.id, c2.id] }).expect(200);
    expect(r1.body.data.map((c) => c.slug)).toEqual([c1.slug, c2.slug]);
    // appended after the existing member of c2
    expect((await query('SELECT sort_order FROM collection_products WHERE collection_id = $1 AND product_id = $2', [c2.id, product.id])).rows[0].sort_order).toBe(1);

    const detail = await api.get(`/api/v1/products/admin/${product.id}`).set(a.ba).expect(200);
    expect(detail.body.data.collections).toEqual([
      { id: c1.id, name: 'One', slug: c1.slug }, { id: c2.id, name: 'Two', slug: c2.slug },
    ]);

    revalidate.mockClear();
    await api.put(url).set(a.sa).send({ collection_ids: [c2.id, c3.id] }).expect(200);
    expect((await api.get(`/api/v1/products/admin/${product.id}`).set(a.sa)).body.data.collections.map((c) => c.name)).toEqual(['Two', 'Three']);
    expect(tagsSent()[0]).toEqual(expect.arrayContaining(['collections', 'products', `product:${product.slug}`, `collection:${c1.slug}`, `collection:${c2.slug}`, `collection:${c3.slug}`]));
    // memberships of other products are untouched
    expect((await query('SELECT 1 FROM collection_products WHERE product_id = $1', [other.product.id])).rowCount).toBe(1);
    await api.put(url).set(a.sa).send({ collection_ids: [] }).expect(200);
    expect((await query('SELECT 1 FROM collection_products WHERE product_id = $1', [product.id])).rowCount).toBe(0);
  });

  test('validation: non-manual or unknown collections 400, duplicates 400, unknown product 404', async () => {
    const a = await actors();
    const { product } = await stocked();
    const auto = await collection({ source: 'newest' });
    const man = await collection();
    const url = `/api/v1/products/${product.id}/collections`;
    await api.put(url).set(a.sa).send({ collection_ids: [auto.id] }).expect(400);
    await api.put(url).set(a.sa).send({ collection_ids: [man.id, auto.id] }).expect(400);
    await api.put(url).set(a.sa).send({ collection_ids: ['11111111-1111-4111-8111-111111111111'] }).expect(400);
    await api.put(url).set(a.sa).send({ collection_ids: [man.id, man.id] }).expect(400);
    await api.put(url).set(a.sa).send({ collection_ids: 'x' }).expect(400);
    await api.put(`/api/v1/products/11111111-1111-4111-8111-111111111111/collections`).set(a.sa).send({ collection_ids: [] }).expect(404);
    expect((await query('SELECT 1 FROM collection_products')).rowCount).toBe(0);
  });
});
