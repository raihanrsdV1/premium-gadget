const { api, query, resetDb, factories: f } = require('../helpers');
const { actors } = require('../catalog/_actors');
const { revalidate, settle, TIMEOUT_MS } = require('../../src/lib/revalidate');
const config = require('../../src/config');

const P = '/api/v1/products';
const HOOK = 'https://storefront.example.com/api/revalidate';
const SECRET = 'a-long-enough-revalidate-secret';

const realFetch = global.fetch;
let fetchMock;
let warn;

beforeEach(async () => {
  await resetDb();
  fetchMock = jest.fn(async () => new Response('{"revalidated":true}', { status: 200 }));
  global.fetch = fetchMock;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await settle();
  delete process.env.STOREFRONT_REVALIDATE_URL;
  delete process.env.REVALIDATE_SECRET;
  global.fetch = realFetch;
  warn.mockRestore();
});

const enable = () => {
  process.env.STOREFRONT_REVALIDATE_URL = HOOK;
  process.env.REVALIDATE_SECRET = SECRET;
};

/** Tags of every revalidation POST so far (after they have been sent). */
const sentTags = async () => {
  await settle();
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).tags);
};

describe('GET /products/sitemap', () => {
  test('active, non-deleted products only: { slug, updated_at, image }, newest first', async () => {
    const { product: a } = await f.product({ name: 'Alpha' });
    const { product: b } = await f.product({ name: 'Bravo' });
    await f.product({ name: 'Hidden', is_active: false });
    const { product: gone } = await f.product({ name: 'Gone' });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [gone.id]);
    // The updated_at trigger stamps each write: b is the most recently changed.
    await query("UPDATE products SET short_description = 'a' WHERE id = $1", [a.id]);
    await query('SELECT pg_sleep(0.02)'); // distinct updated_at stamps, so the order is deterministic
    await query("UPDATE products SET short_description = 'b' WHERE id = $1", [b.id]);
    await query(
      `INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES
         ($1, 'https://cdn.example.com/b2.jpg', FALSE, 0), ($1, 'https://cdn.example.com/b1.jpg', TRUE, 1)`,
      [b.id]
    );

    const res = await api.get(`${P}/sitemap`).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.data).toEqual([
      { slug: b.slug, updated_at: expect.any(String), image: 'https://cdn.example.com/b1.jpg' },
      { slug: a.slug, updated_at: expect.any(String), image: null },
    ]);
    expect(new Date(res.body.data[0].updated_at).getTime()).toBeGreaterThan(new Date(res.body.data[1].updated_at).getTime());
  });

  test('"sitemap" is a reserved product slug', async () => {
    const a = await actors();
    const cat = await f.category();
    await api.post(P).set(a.ba).send({ name: 'Sitemap', slug: 'sitemap', category_id: cat.id }).expect(400);
    const auto = await api.post(P).set(a.ba).send({ name: 'Sitemap', category_id: cat.id }).expect(201);
    expect(auto.body.data.slug).toBe('sitemap-2');
  });
});

describe('categories and brands expose updated_at', () => {
  test('public and admin lists', async () => {
    const a = await actors();
    await f.category({ slug: 'laptops' });
    await f.brand({ slug: 'apple' });
    for (const url of ['/api/v1/categories', '/api/v1/categories/admin', '/api/v1/brands', '/api/v1/brands/admin']) {
      const row = (await api.get(url).set(a.sa).expect(200)).body.data[0];
      expect(Number.isNaN(Date.parse(row.updated_at))).toBe(false);
    }
  });
});

describe('storefront revalidation hook', () => {
  test('disabled unless both env vars are set, and with a short secret', async () => {
    const a = await actors();
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'Apple' }).expect(201);
    process.env.STOREFRONT_REVALIDATE_URL = HOOK;
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'Dell' }).expect(201);
    process.env.REVALIDATE_SECRET = 'too-short'; // the storefront requires ≥ 16 chars
    expect(config.revalidate.url).toBeNull();
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'HP' }).expect(201);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('POSTs the tags with the secret header, a timeout and no redirects', async () => {
    enable();
    const a = await actors();
    const cat = await f.category();
    const res = await api.post(P).set(a.ba).send({ name: 'ThinkPad T480', category_id: cat.id }).expect(201);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(HOOK);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'x-revalidate-secret': SECRET });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({ tags: ['products', 'banners', 'collections', `product:${res.body.data.slug}`] });
  });

  test('every catalog / banner / settings write sends its tags', async () => {
    enable();
    const a = await actors();
    const cat = (await api.post('/api/v1/categories').set(a.ba).send({ name: 'Laptops' }).expect(201)).body.data;
    await api.put(`/api/v1/categories/${cat.id}`).set(a.ba).send({ description: 'All laptops' }).expect(200);
    await api.put(`/api/v1/categories/${cat.id}/spec-template`).set(a.ba).send({ groups: [] }).expect(200);
    const brand = (await api.post('/api/v1/brands').set(a.ba).send({ name: 'Lenovo' }).expect(201)).body.data;
    await api.put(`/api/v1/brands/${brand.id}`).set(a.ba).send({ sort_order: 2 }).expect(200);
    await api.delete(`/api/v1/brands/${brand.id}`).set(a.sa).expect(200);

    const product = (await api.post(P).set(a.ba).send({
      name: 'T480', slug: 't480', category_id: cat.id,
      variants: [{ sku: 'T480-1', variant_name: 'Base', price: 30000 }],
    }).expect(201)).body.data;
    await api.put(`${P}/${product.id}`).set(a.ba).send({ slug: 't480-used' }).expect(200);
    await api.put(`${P}/variants/${product.variants[0].id}`).set(a.ba).send({ variant_name: 'i5 / 8 GB' }).expect(200);
    await api.post(`${P}/${product.id}/specifications`).set(a.ba).send({ spec_key: 'RAM', spec_value: '8 GB' }).expect(201);
    await api.post(`${P}/${product.id}/images`).set(a.ba).send({ image_url: 'https://cdn.example.com/x.jpg' }).expect(201);
    await api.delete(`${P}/${product.id}`).set(a.sa).expect(200);

    const banner = (await api.post('/api/v1/banners').set(a.ba).send({ image_url: 'https://cdn.example.com/b.jpg' }).expect(201)).body.data;
    await api.put('/api/v1/banners/order').set(a.ba).send({ placement: 'hero', ids: [banner.id] }).expect(200);
    await api.delete(`/api/v1/banners/${banner.id}`).set(a.sa).expect(200);
    await api.put('/api/v1/settings/social').set(a.sa).send({ facebook: 'https://facebook.com/pg' }).expect(200);

    const p = (slug) => ['products', 'banners', 'collections', `product:${slug}`];
    expect(await sentTags()).toEqual([
      ['categories'],
      ['categories', 'products'],
      ['categories', 'products'],
      ['brands'],
      ['brands', 'products'],
      ['brands'],
      p('t480'),
      ['products', 'banners', 'collections', 'product:t480', 'product:t480-used'], // old and new slug
      p('t480-used'),
      p('t480-used'),
      p('t480-used'),
      p('t480-used'),
      ['banners'],
      ['banners'],
      ['banners'],
      ['settings'],
    ]);
  });

  test('failed writes revalidate nothing', async () => {
    enable();
    const a = await actors();
    const cat = await f.category();
    await api.post(P).set(a.ba).send({ name: 'Dup SKUs', category_id: cat.id, variants: [{ sku: 'DUP', variant_name: 'a', price: 1 }, { sku: 'dup', variant_name: 'b', price: 1 }] }).expect(409);
    // Fails after the product row was inserted: rolled back, nothing sent.
    await api.post(P).set(a.ba).send({ name: 'Bad image', category_id: cat.id, images: [{ image_url: 'https://cdn.example.com/x.jpg', variant_sku: 'NOPE' }] }).expect(400);
    expect((await query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n).toBe(0);
    await api.put(`/api/v1/categories/${cat.id}/spec-template`).set(a.ba).send({ groups: 'x' }).expect(400);
    await api.delete('/api/v1/banners/00000000-0000-4000-8000-000000000000').set(a.sa).expect(404);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a failing, rejecting or erroring storefront never breaks or delays the request', async () => {
    enable();
    const a = await actors();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'One' }).expect(201);
    fetchMock.mockImplementation(async () => new Response('nope', { status: 401 }));
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'Two' }).expect(201);
    fetchMock.mockImplementation(() => {
      throw new Error('synchronous throw');
    });
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'Three' }).expect(201);

    expect(await Promise.all([revalidate(['brands']), revalidate(['brands'])])).toEqual([false, false]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(/fetch failed[\s\S]*HTTP 401[\s\S]*synchronous throw/);
  });

  test('a hanging storefront: the response is immediate and the call is aborted at the timeout', async () => {
    enable();
    const a = await actors();
    fetchMock.mockImplementation(
      (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      })
    );
    const started = Date.now();
    await api.post('/api/v1/brands').set(a.ba).send({ name: 'Slow' }).expect(201);
    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS);
    expect(await settle()).toEqual([false]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(warn.mock.calls[0][0]).toMatch(/timed out/);
  }, 10000);

  test('tags are de-duplicated and junk tags dropped', async () => {
    enable();
    expect(await revalidate(['products', 'products', '', null, 'bad tag!', 'product:ok-1'])).toBe(true);
    expect(await sentTags()).toEqual([['products', 'product:ok-1']]);
    expect(await revalidate([])).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
