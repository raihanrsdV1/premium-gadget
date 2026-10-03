const { api, query, resetDb, factories: f } = require('../helpers');
const { actors, auditFor } = require('../catalog/_actors');

beforeEach(resetDb);

const B = '/api/v1/banners';
const DAY = 24 * 3600 * 1000;
const past = (days = 2) => new Date(Date.now() - days * DAY).toISOString();
const future = (days = 2) => new Date(Date.now() + days * DAY).toISOString();
const IMG = 'https://cdn.example.com/hero.jpg';

/** Insert a banner directly (bypassing the API). */
const banner = async (fields = {}) => {
  const row = { placement: 'hero', sort_order: 0, is_active: true, ...fields };
  if (!row.product_id && !row.image_url) row.image_url = IMG;
  const keys = Object.keys(row);
  const { rows } = await query(
    `INSERT INTO banners (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    keys.map((k) => row[k])
  );
  return rows[0];
};

/** An in-stock product with a primary image, brand and highlights. */
const stockedProduct = async (overrides = {}) => {
  const branch = overrides.branch || (await f.branch());
  const brand = await f.brand({ name: 'Apple', slug: `apple-${Math.random().toString(36).slice(2, 8)}` });
  const { product, variants } = await f.product({
    name: overrides.name || 'MacBook Air M1',
    brand_id: brand.id,
    condition: 'used',
    variants: overrides.variants || [
      { price: 70000, stock: [{ branch_id: branch.id, quantity: 0 }] }, // cheapest but sold out
      { price: 72000, compare_at_price: 76000, stock: [{ branch_id: branch.id, quantity: 2 }] },
    ],
  });
  await query(
    `UPDATE products SET short_description = 'Fanless and fast', condition_grade = 'A', battery_health = 89 WHERE id = $1`,
    [product.id]
  );
  await query("INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, 'https://cdn.example.com/mba.jpg', TRUE)", [product.id]);
  await query(
    `INSERT INTO product_specifications (product_id, spec_key, spec_value, field_key, is_highlight, sort_order)
     VALUES ($1, 'Processor', 'Apple M1', 'processor', TRUE, 0), ($1, 'RAM', '8 GB', 'ram', TRUE, 1),
            ($1, 'Weight', '1.29 kg', 'weight', FALSE, 2)`,
    [product.id]
  );
  return { product, variants, branch };
};

describe('GET /banners (public)', () => {
  test('product slides resolve live data; custom slides pass through; cache header', async () => {
    const { product, variants } = await stockedProduct();
    // A live sale on the in-stock variant: the slide shows the sale price.
    await query(
      'UPDATE product_variants SET sale_price = 69000, sale_starts_at = $2, sale_ends_at = $3 WHERE id = $1',
      [variants[1].id, past(), future(3)]
    );
    await banner({ product_id: product.id, sort_order: 0, badge: 'Hot Deal' });
    await banner({
      sort_order: 1, title: 'Expert repairs', subtitle: 'Chip-level', image_url: IMG,
      mobile_image_url: 'https://cdn.example.com/hero-m.jpg', cta_label: 'Book a repair', link_url: '/repairs',
    });

    const res = await api.get(B).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const [slide, custom] = res.body.data;
    expect(slide).toEqual({
      id: expect.any(String),
      type: 'product',
      title: 'MacBook Air M1',
      subtitle: 'Fanless and fast',
      badge: 'Hot Deal',
      image_url: 'https://cdn.example.com/mba.jpg',
      mobile_image_url: null,
      cta_label: 'Buy now',
      link_url: `/products/${product.slug}`,
      product: {
        id: product.id,
        slug: product.slug,
        name: 'MacBook Air M1',
        brand: 'Apple',
        price: '69000.00',
        compare_at_price: '76000.00', // the higher of regular and compare-at while on sale
        is_on_sale: true,
        sale_ends_at: expect.any(String),
        in_stock: true,
        condition_code: 'used',
        condition_grade: 'A',
        battery_health: 89,
        highlights: [{ label: 'Processor', value: 'Apple M1' }, { label: 'RAM', value: '8 GB' }],
      },
    });
    expect(custom).toEqual({
      id: expect.any(String), type: 'custom', title: 'Expert repairs', subtitle: 'Chip-level', badge: null,
      image_url: IMG, mobile_image_url: 'https://cdn.example.com/hero-m.jpg', cta_label: 'Book a repair',
      link_url: '/repairs', product: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cost_price|created_by/);
  });

  test('explicit slide fields override the product defaults', async () => {
    const { product } = await stockedProduct();
    await banner({ product_id: product.id, title: 'Back to school', subtitle: 'From ৳72,000', image_url: IMG, cta_label: 'Shop now', link_url: '/products?category=macbooks' });
    const [slide] = (await api.get(B).expect(200)).body.data;
    expect(slide).toMatchObject({
      type: 'product', title: 'Back to school', subtitle: 'From ৳72,000', image_url: IMG,
      cta_label: 'Shop now', link_url: '/products?category=macbooks',
    });
    expect(slide.product.price).toBe('72000.00');
  });

  test('hides inactive, out-of-window, inactive/deleted/out-of-stock products; orders by sort_order', async () => {
    const live = await stockedProduct({ name: 'Live' });
    const inactive = await stockedProduct({ name: 'Inactive product' });
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [inactive.product.id]);
    const deleted = await stockedProduct({ name: 'Deleted product' });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [deleted.product.id]);
    const soldOut = await stockedProduct({ name: 'Sold out', variants: [{ price: 1000, stock: [] }] });
    const reserved = await stockedProduct({ name: 'All reserved' });
    await query('UPDATE inventory SET reserved = quantity WHERE variant_id = ANY($1::uuid[])', [reserved.variants.map((v) => v.id)]);
    const variantOff = await stockedProduct({ name: 'Variant off' });
    await query('UPDATE product_variants SET is_active = FALSE WHERE product_id = $1', [variantOff.product.id]);

    await banner({ title: 'Third', sort_order: 3 });
    await banner({ product_id: live.product.id, sort_order: 1 });
    await banner({ title: 'Second', sort_order: 2, starts_at: past(1), ends_at: future(1) });
    await banner({ title: 'Off', is_active: false });
    await banner({ title: 'Scheduled', starts_at: future(1) });
    await banner({ title: 'Expired', starts_at: past(5), ends_at: past(1) });
    await banner({ title: 'Promo', placement: 'promo' });
    for (const p of [inactive, deleted, soldOut, reserved, variantOff]) await banner({ product_id: p.product.id });

    const hero = (await api.get(B).expect(200)).body.data;
    expect(hero.map((b) => b.title)).toEqual(['Live', 'Second', 'Third']);
    expect((await api.get(`${B}?placement=hero`).expect(200)).body.data).toHaveLength(3);
    expect((await api.get(`${B}?placement=promo`).expect(200)).body.data.map((b) => b.title)).toEqual(['Promo']);
  });

  test('query validation: unknown placement and arrays → 400', async () => {
    await api.get(`${B}?placement=sidebar`).expect(400);
    await api.get(`${B}?placement=hero&placement=promo`).expect(400);
    await api.get(`${B}?placement=`).expect(200);
  });

  test('deleting a product removes its slides (ON DELETE CASCADE)', async () => {
    const { product } = await stockedProduct();
    await banner({ product_id: product.id });
    await query('DELETE FROM product_specifications WHERE product_id = $1', [product.id]);
    await query('DELETE FROM product_images WHERE product_id = $1', [product.id]);
    await query('DELETE FROM inventory WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)', [product.id]);
    await query('DELETE FROM products WHERE id = $1', [product.id]);
    expect((await query('SELECT COUNT(*)::int AS n FROM banners')).rows[0].n).toBe(0);
  });
});

describe('admin banner endpoints', () => {
  test('authz matrix: anon 401, customer 403, staff OK, delete super_admin only', async () => {
    const a = await actors();
    const body = { image_url: IMG, title: 'Sale' };
    await api.get(`${B}/admin`).expect(401);
    await api.get(`${B}/admin`).set(a.cust).expect(403);
    await api.post(B).send(body).expect(401);
    await api.post(B).set(a.cust).send(body).expect(403);

    const created = await api.post(B).set(a.ba).send(body).expect(201);
    const id = created.body.data.id;
    await api.put(`${B}/${id}`).send({ title: 'x' }).expect(401);
    await api.put(`${B}/${id}`).set(a.cust).send({ title: 'x' }).expect(403);
    await api.put(`${B}/${id}`).set(a.baOther).send({ title: 'Other branch staff may edit' }).expect(200);
    await api.put(`${B}/order`).set(a.cust).send({ placement: 'hero', ids: [id] }).expect(403);

    await api.delete(`${B}/${id}`).expect(401);
    await api.delete(`${B}/${id}`).set(a.cust).expect(403);
    await api.delete(`${B}/${id}`).set(a.ba).expect(403);
    await api.delete(`${B}/${id}`).set(a.sa).expect(200);
    await api.delete(`${B}/${id}`).set(a.sa).expect(404);

    expect((await auditFor(id)).map((r) => r.action)).toEqual(['banner.create', 'banner.update', 'banner.delete']);
    expect((await auditFor(id))[0].actor_id).toBe(a.users.ba.id);
  });

  test('create: product slide or custom slide; defaults; created_by; appended to the end', async () => {
    const a = await actors();
    const { product } = await stockedProduct();
    const p1 = await api.post(B).set(a.ba).send({ product_id: product.id }).expect(201);
    expect(p1.body.data).toMatchObject({
      placement: 'hero', product_id: product.id, type: 'product', sort_order: 0, is_active: true,
      status: 'live', created_by: a.users.ba.id,
      product: { id: product.id, name: 'MacBook Air M1', slug: product.slug, is_active: true, in_stock: true, image: 'https://cdn.example.com/mba.jpg' },
    });
    const c1 = await api.post(B).set(a.sa).send({
      image_url: IMG, title: '  Repairs  ', badge: '', link_url: '/repairs', starts_at: future(1), ends_at: future(3),
    }).expect(201);
    expect(c1.body.data).toMatchObject({ type: 'custom', title: 'Repairs', badge: null, sort_order: 1, status: 'scheduled', product: null });
    const promo = await api.post(B).set(a.sa).send({ placement: 'promo', image_url: IMG }).expect(201);
    expect(promo.body.data.sort_order).toBe(0);
  });

  test('validation: link_url, image_url, lengths, window, source, unknown product', async () => {
    const a = await actors();
    const bad = async (body) => api.post(B).set(a.ba).send({ image_url: IMG, ...body }).expect(400);
    await bad({ link_url: 'javascript:alert(1)' });
    await bad({ link_url: '//evil.com' });
    await bad({ link_url: '/\\evil.com' });
    await bad({ link_url: 'data:text/html,hi' });
    await bad({ link_url: 'repairs' });
    await bad({ link_url: '/re pairs' });
    await bad({ image_url: 'javascript:alert(1)' });
    await bad({ image_url: '/uploads/x.jpg' });
    await bad({ mobile_image_url: 'ftp://x.com/a.jpg' });
    await bad({ badge: 'b'.repeat(31) });
    await bad({ title: 't'.repeat(121) });
    await bad({ subtitle: 's'.repeat(201) });
    await bad({ starts_at: future(2), ends_at: future(1) });
    await bad({ starts_at: 'tomorrow' });
    await bad({ placement: 'sidebar' });
    await bad({ placement: ['hero'] });
    await bad({ sort_order: 1.5 });
    await bad({ is_active: 'yes' });
    await bad({ product_id: 'nope' });
    await api.post(B).set(a.ba).send({ title: 'No image, no product' }).expect(400);
    await api.post(B).set(a.ba).send({ image_url: '' }).expect(400);
    await bad({ product_id: '00000000-0000-4000-8000-000000000000' });

    // Accepted link forms.
    for (const link of ['/repairs', '/', '/products?category=used-laptops#top', 'https://www.facebook.com/premiumgadget.official/']) {
      await api.post(B).set(a.ba).send({ image_url: IMG, link_url: link }).expect(201);
    }
    // A deleted product can't be promoted.
    const { product } = await stockedProduct();
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [product.id]);
    await bad({ product_id: product.id });
  });

  test('update: partial, merged-state checks, empty strings clear, 404s', async () => {
    const a = await actors();
    const { product } = await stockedProduct();
    const created = (await api.post(B).set(a.ba).send({ product_id: product.id, image_url: IMG, title: 'T' }).expect(201)).body.data;
    const url = `${B}/${created.id}`;

    const up = await api.put(url).set(a.ba).send({ subtitle: 'New', link_url: '' }).expect(200);
    expect(up.body.data).toMatchObject({ title: 'T', subtitle: 'New', link_url: null });
    // Removing the product is fine while an image remains …
    await api.put(url).set(a.ba).send({ product_id: null }).expect(200);
    // … but not removing the image too.
    await api.put(url).set(a.ba).send({ image_url: null }).expect(400);
    await api.put(url).set(a.ba).send({ image_url: '' }).expect(400);
    // Window checked against the stored value.
    await api.put(url).set(a.ba).send({ starts_at: future(5) }).expect(200);
    await api.put(url).set(a.ba).send({ ends_at: future(1) }).expect(400);
    await api.put(url).set(a.ba).send({ is_active: false }).expect(200);
    const list = (await api.get(`${B}/admin`).set(a.ba).expect(200)).body.data;
    expect(list[0]).toMatchObject({ id: created.id, status: 'inactive' });

    await api.put(url).set(a.ba).send({}).expect(400);
    await api.put(url).set(a.ba).send({ link_url: '//evil.com' }).expect(400);
    await api.put(`${B}/00000000-0000-4000-8000-000000000000`).set(a.ba).send({ title: 'x' }).expect(404);
    await api.put(`${B}/not-a-uuid`).set(a.ba).send({ title: 'x' }).expect(400);
  });

  test('admin list: every banner with status, filters by placement / status', async () => {
    const a = await actors();
    const { product } = await stockedProduct();
    await query('UPDATE inventory SET quantity = 0'); // product now out of stock
    await banner({ title: 'Live', sort_order: 1 });
    await banner({ title: 'Scheduled', starts_at: future(1), sort_order: 2 });
    await banner({ title: 'Expired', ends_at: past(1), sort_order: 3 });
    await banner({ title: 'Inactive', is_active: false, sort_order: 4 });
    await banner({ product_id: product.id, sort_order: 0 });
    await banner({ title: 'Promo', placement: 'promo' });

    const all = (await api.get(`${B}/admin`).set(a.ba).expect(200)).body.data;
    expect(all.map((b) => [b.placement, b.title, b.status])).toEqual([
      ['hero', null, 'live'],
      ['hero', 'Live', 'live'],
      ['hero', 'Scheduled', 'scheduled'],
      ['hero', 'Expired', 'expired'],
      ['hero', 'Inactive', 'inactive'],
      ['promo', 'Promo', 'live'],
    ]);
    // The product slide is "live" but its product can't be shown.
    expect(all[0].product).toMatchObject({ id: product.id, in_stock: false, is_active: true });
    expect((await api.get(`${B}/admin?placement=promo`).set(a.ba).expect(200)).body.data).toHaveLength(1);
    expect((await api.get(`${B}/admin?status=expired`).set(a.ba).expect(200)).body.data.map((b) => b.title)).toEqual(['Expired']);
    await api.get(`${B}/admin?status=dead`).set(a.ba).expect(400);
    await api.get(`${B}/admin?placement=hero&placement=promo`).set(a.ba).expect(400);
  });

  test('reorder: must list every banner of the placement exactly once', async () => {
    const a = await actors();
    const h1 = await banner({ title: 'A', sort_order: 0 });
    const h2 = await banner({ title: 'B', sort_order: 1 });
    const h3 = await banner({ title: 'C', sort_order: 2 });
    const p1 = await banner({ title: 'P', placement: 'promo' });

    const res = await api.put(`${B}/order`).set(a.ba).send({ placement: 'hero', ids: [h3.id, h1.id, h2.id] }).expect(200);
    expect(res.body.data.map((b) => [b.title, b.sort_order])).toEqual([['C', 0], ['A', 1], ['B', 2]]);
    expect((await api.get(B)).body.data.map((b) => b.title)).toEqual(['C', 'A', 'B']);

    const order = (ids, placement = 'hero') => api.put(`${B}/order`).set(a.ba).send({ placement, ids });
    await order([h1.id, h2.id]).expect(400); // missing one
    await order([h1.id, h2.id, h3.id, h3.id]).expect(400); // duplicate
    await order([h1.id, h2.id, p1.id]).expect(400); // wrong placement
    await order([h1.id, h2.id, h3.id], 'promo').expect(400);
    await order([]).expect(400);
    await order(['x']).expect(400);
    await api.put(`${B}/order`).set(a.ba).send([h1.id]).expect(400);
    expect((await query("SELECT action, data FROM admin_audit_log WHERE action = 'banner.reorder'")).rows).toEqual([
      { action: 'banner.reorder', data: { placement: 'hero', order: [h3.id, h1.id, h2.id] } },
    ]);
  });

  test('concurrent creates in one placement get distinct sort orders', async () => {
    const a = await actors();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => api.post(B).set(a.ba).send({ image_url: IMG, title: `S${i}` }))
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(results.map((r) => r.body.data.sort_order).sort()).toEqual([0, 1, 2, 3]);
  });

  test('database constraints back up the API', async () => {
    await expect(query("INSERT INTO banners (title) VALUES ('x')")).rejects.toThrow(/chk_banners_source/);
    await expect(banner({ link_url: '//evil.com' })).rejects.toThrow(/chk_banners_link_url/);
    await expect(banner({ link_url: 'javascript:alert(1)' })).rejects.toThrow(/chk_banners_link_url/);
    await expect(banner({ placement: 'side' })).rejects.toThrow(/chk_banners_placement/);
    await expect(banner({ starts_at: future(2), ends_at: future(1) })).rejects.toThrow(/chk_banners_window/);
    await expect(banner({ image_url: 'data:image/png;base64,AAAA' })).rejects.toThrow(/chk_banners_image_url/);
  });
});
