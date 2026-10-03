const { api, query, resetDb, factories: f } = require('../helpers');

beforeEach(resetDb);

const P = '/api/v1/products';
const DAY = 24 * 3600 * 1000;
const past = (days = 2) => new Date(Date.now() - days * DAY).toISOString();
const future = (days = 2) => new Date(Date.now() + days * DAY).toISOString();

const sale = (variantId, price, starts, ends) =>
  query('UPDATE product_variants SET sale_price = $2, sale_starts_at = $3, sale_ends_at = $4 WHERE id = $1', [variantId, price, starts, ends]);

// Field names the storefront reads today (must never disappear).
const LIST_FIELDS = ['id', 'name', 'slug', 'short_description', 'is_featured', 'condition', 'brand', 'brand_slug', 'price', 'compare_at_price', 'image'];
const NEW_LIST_FIELDS = ['condition_code', 'in_stock', 'badge', 'condition_grade', 'warranty_months', 'updated_at'];

describe('GET /products (list)', () => {
  test('backwards-compatible shape plus new fields; never exposes cost_price', async () => {
    const brand = await f.brand({ name: 'Apple', slug: 'apple' });
    const branch = await f.branch();
    const { product, variants: [v] } = await f.product({ brand_id: brand.id, condition: 'used', variants: [{ price: 90000, stock: [{ branch_id: branch.id, quantity: 1 }] }] });
    await query("UPDATE product_variants SET cost_price = 70000 WHERE id = $1", [v.id]);
    await query("UPDATE products SET badge = 'Hot', condition_grade = 'A', warranty_months = 3 WHERE id = $1", [product.id]);
    await query("INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, 'https://cdn.example.com/p.jpg', TRUE)", [product.id]);

    const res = await api.get(P).expect(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
    const row = res.body.data[0];
    for (const k of [...LIST_FIELDS, ...NEW_LIST_FIELDS]) expect(row).toHaveProperty(k);
    expect(row).toMatchObject({
      condition: 'Pre-Owned', condition_code: 'used', brand: 'Apple', brand_slug: 'apple',
      price: '90000.00', compare_at_price: null, image: 'https://cdn.example.com/p.jpg',
      in_stock: true, badge: 'Hot', condition_grade: 'A', warranty_months: 3,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cost_price|70000/);
  });

  test('price and compare-at come from the SAME cheapest active variant', async () => {
    await f.product({
      variants: [
        { price: 50000 }, // cheapest, no compare-at
        { price: 60000, compare_at_price: 70000 },
        { price: 10000, compare_at_price: 99000, is_active: false }, // ignored
      ],
    });
    const row = (await api.get(P).expect(200)).body.data[0];
    expect(row.price).toBe('50000.00');
    expect(row.compare_at_price).toBeNull(); // old MIN() logic would have shown 70000
  });

  test('scheduled sale prices: only a live window changes the price', async () => {
    const live = await f.product({ name: 'Live sale', variants: [{ price: 1000 }] });
    const ended = await f.product({ name: 'Ended sale', variants: [{ price: 1000 }] });
    const upcoming = await f.product({ name: 'Upcoming sale', variants: [{ price: 1000 }] });
    const open = await f.product({ name: 'Open-ended sale', variants: [{ price: 1000, compare_at_price: 1500 }] });
    await sale(live.variants[0].id, 800, past(), future());
    await sale(ended.variants[0].id, 800, past(5), past(1));
    await sale(upcoming.variants[0].id, 800, future(1), future(5));
    await sale(open.variants[0].id, 700, null, null);

    const rows = Object.fromEntries((await api.get(P).expect(200)).body.data.map((r) => [r.name, r]));
    expect(rows['Live sale']).toMatchObject({ price: '800.00', compare_at_price: '1000.00' });
    expect(rows['Ended sale']).toMatchObject({ price: '1000.00', compare_at_price: null });
    expect(rows['Upcoming sale']).toMatchObject({ price: '1000.00', compare_at_price: null });
    expect(rows['Open-ended sale']).toMatchObject({ price: '700.00', compare_at_price: '1500.00' });
  });

  test('a sale can make a different variant the cheapest one', async () => {
    const { variants: [, pricey] } = await f.product({ variants: [{ price: 50000 }, { price: 55000, compare_at_price: 60000 }] });
    await sale(pricey.id, 45000, past(), future());
    const row = (await api.get(P).expect(200)).body.data[0];
    expect(row).toMatchObject({ price: '45000.00', compare_at_price: '60000.00' });
  });

  test('hides inactive, soft-deleted and variant-less products', async () => {
    const shown = await f.product({ name: 'Shown' });
    await f.product({ name: 'Inactive', is_active: false });
    const deleted = await f.product({ name: 'Deleted' });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [deleted.product.id]);
    await f.product({ name: 'No active variant', variants: [{ is_active: false }] });
    await query("INSERT INTO products (name, slug, category_id) VALUES ('No variants', 'no-variants', $1)", [shown.product.category_id]);

    const res = await api.get(P).expect(200);
    expect(res.body.data.map((r) => r.name)).toEqual(['Shown']);
    expect(res.body.pagination.total).toBe(1);
  });

  test('filters: category (incl. children), brand, condition aliases, price range', async () => {
    const laptops = await f.category({ slug: 'laptops' });
    const macbooks = await f.category({ slug: 'macbooks', parent_id: laptops.id });
    const audio = await f.category({ slug: 'audio' });
    const apple = await f.brand({ slug: 'apple' });
    await f.product({ name: 'MBA', category_id: macbooks.id, brand_id: apple.id, variants: [{ price: 120000 }] });
    await f.product({ name: 'ThinkPad', category_id: laptops.id, condition: 'used', variants: [{ price: 60000 }] });
    await f.product({ name: 'AirPods', category_id: audio.id, brand_id: apple.id, variants: [{ price: 25000 }] });

    const names = async (qs) => (await api.get(`${P}?${qs}`).expect(200)).body.data.map((r) => r.name).sort();
    expect(await names('category=laptops')).toEqual(['MBA', 'ThinkPad']);
    expect(await names('category=Laptops')).toEqual(['MBA', 'ThinkPad']);
    expect(await names('category=macbooks')).toEqual(['MBA']);
    expect(await names('category=nope')).toEqual([]);
    expect(await names('brand=apple')).toEqual(['AirPods', 'MBA']);
    expect(await names('condition=used')).toEqual(['ThinkPad']);
    expect(await names('condition=pre-owned')).toEqual(['ThinkPad']);
    expect(await names('condition=new')).toEqual(['AirPods', 'MBA']);
    expect(await names('min_price=50000&max_price=130000')).toEqual(['MBA', 'ThinkPad']);
    expect(await names('max_price=25000')).toEqual(['AirPods']);
    expect(await names('category=&brand=')).toEqual(['AirPods', 'MBA', 'ThinkPad']);
  });

  test('sorting', async () => {
    await f.product({ name: 'Bravo', variants: [{ price: 300 }] });
    await f.product({ name: 'Alpha', variants: [{ price: 200 }] });
    await f.product({ name: 'Charlie', variants: [{ price: 100 }] });
    const names = async (sort) => (await api.get(`${P}?sort=${sort}`).expect(200)).body.data.map((r) => r.name);
    expect(await names('newest')).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(await names('price_asc')).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(await names('price_desc')).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(await names('name')).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('query validation → 400 (never 500)', async () => {
    for (const qs of [
      'sort=price', 'sort=p.name;DROP TABLE products', 'page=0', 'limit=101', 'limit=abc',
      'page=1&page=2', 'category=a&category=b', 'category[a]=1', 'brand=bad%20slug!', 'condition=broken',
      'min_price=-1', 'min_price=10&max_price=5', 'max_price=a&max_price=b',
    ]) {
      const res = await api.get(`${P}?${qs}`);
      expect([qs, res.status]).toEqual([qs, 400]);
    }
  });

  test('refurbished / open box labels', async () => {
    const r = await f.product({ name: 'Refurb' });
    const o = await f.product({ name: 'OpenBox' });
    await query("UPDATE products SET condition = 'refurbished' WHERE id = $1", [r.product.id]);
    await query("UPDATE products SET condition = 'open_box' WHERE id = $1", [o.product.id]);
    const rows = Object.fromEntries((await api.get(P).expect(200)).body.data.map((x) => [x.name, x]));
    expect(rows.Refurb).toMatchObject({ condition: 'Refurbished', condition_code: 'refurbished' });
    expect(rows.OpenBox).toMatchObject({ condition: 'Open Box', condition_code: 'open_box' });
    const filtered = (await api.get(`${P}?condition=refurbished`).expect(200)).body.data;
    expect(filtered.map((x) => x.name)).toEqual(['Refurb']);
  });

  test('in_stock reflects available (quantity - reserved) across branches', async () => {
    const branch = await f.branch();
    await f.product({ name: 'Reserved out', variants: [{ stock: [{ branch_id: branch.id, quantity: 1, reserved: 1 }] }] });
    await f.product({ name: 'Available', variants: [{ stock: [{ branch_id: branch.id, quantity: 2, reserved: 1 }] }] });
    await f.product({ name: 'No rows' });
    const rows = Object.fromEntries((await api.get(P).expect(200)).body.data.map((x) => [x.name, x.in_stock]));
    expect(rows).toEqual({ 'Reserved out': false, Available: true, 'No rows': false });
  });
});

describe('GET /products/featured', () => {
  test('featured only, ordered by sort_order then newest, limit ≤ 24', async () => {
    const a = await f.product({ name: 'A', is_featured: true });
    const b = await f.product({ name: 'B', is_featured: true });
    await f.product({ name: 'C', is_featured: true });
    await f.product({ name: 'Not featured' });
    await query('UPDATE products SET sort_order = 1 WHERE id = $1', [a.product.id]);
    await query('UPDATE products SET sort_order = -1 WHERE id = $1', [b.product.id]);

    const res = await api.get(`${P}/featured`).expect(200);
    expect(res.body.data.map((r) => r.name)).toEqual(['B', 'C', 'A']);
    for (const k of [...LIST_FIELDS, ...NEW_LIST_FIELDS]) expect(res.body.data[0]).toHaveProperty(k);

    expect((await api.get(`${P}/featured?limit=2`).expect(200)).body.data).toHaveLength(2);
    await api.get(`${P}/featured?limit=25`).expect(400);
    await api.get(`${P}/featured?limit=1&limit=2`).expect(400);
  });

  test('defaults to 8', async () => {
    for (let i = 0; i < 10; i++) await f.product({ is_featured: true });
    expect((await api.get(`${P}/featured`).expect(200)).body.data).toHaveLength(8);
  });
});

describe('GET /products/search', () => {
  test('typo-tolerant name match, brand match, ranking, LIKE input escaped', async () => {
    const apple = await f.brand({ name: 'Apple', slug: 'apple' });
    await f.product({ name: 'MacBook Air M2', brand_id: apple.id });
    await f.product({ name: 'Dell XPS 13' });
    await f.product({ name: '100% Cotton Sleeve' });

    const names = async (q) => (await api.get(`${P}/search`).query({ q }).expect(200)).body.data.map((r) => r.name);
    expect(await names('macbok')).toEqual(['MacBook Air M2']);
    expect(await names('apple')).toEqual(['MacBook Air M2']);
    expect(await names('xps')).toEqual(['Dell XPS 13']);
    expect(await names('%%')).toEqual([]);
    expect(await names('__')).toEqual([]);
    expect(await names('0%')).toEqual(['100% Cotton Sleeve']);

    const res = await api.get(`${P}/search?q=dell`).expect(200);
    for (const k of [...LIST_FIELDS, ...NEW_LIST_FIELDS]) expect(res.body.data[0]).toHaveProperty(k);
    expect(res.body.pagination.total).toBe(1);
  });

  test('requires q of at least 2 characters; arrays rejected', async () => {
    await api.get(`${P}/search`).expect(400);
    await api.get(`${P}/search?q=a`).expect(400);
    await api.get(`${P}/search?q=%20a%20`).expect(400);
    await api.get(`${P}/search?q=ab&q=cd`).expect(400);
    await api.get(`${P}/search?q=${'x'.repeat(101)}`).expect(400);
  });

  test('hides inactive and deleted products', async () => {
    await f.product({ name: 'Hidden Laptop', is_active: false });
    const d = await f.product({ name: 'Deleted Laptop' });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [d.product.id]);
    expect((await api.get(`${P}/search?q=laptop`).expect(200)).body.data).toHaveLength(0);
  });
});

describe('GET /products/:slug', () => {
  const build = async () => {
    const b1 = await f.branch({ name: 'Agrabad' });
    const b2 = await f.branch({ name: 'GEC Circle' });
    const closed = await f.branch({ name: 'Closed branch', is_active: false });
    const brand = await f.brand({ name: 'Dell', slug: 'dell' });
    const { product, variants } = await f.product({
      name: 'Dell Latitude 7420', brand_id: brand.id, condition: 'used',
      variants: [
        { sku: 'L-16', variant_name: '16GB', price: 60000, compare_at_price: 65000, stock: [{ branch_id: b1.id, quantity: 2, reserved: 1 }, { branch_id: closed.id, quantity: 4 }] },
        { sku: 'L-8', variant_name: '8GB', price: 50000, stock: [{ branch_id: b2.id, quantity: 1 }] },
        { sku: 'L-OFF', variant_name: 'Old', price: 1, is_active: false },
      ],
    });
    await query('UPDATE product_variants SET cost_price = 41234 WHERE product_id = $1', [product.id]);
    await query(
      `UPDATE products SET warranty_months = 6, warranty_type = 'shop', warranty_notes = 'Parts only',
              condition_grade = 'A', battery_health = 88, battery_cycles = 210, accessories = 'Charger',
              badge = 'Best value', og_image_url = 'https://cdn.example.com/og.jpg' WHERE id = $1`,
      [product.id]
    );
    await query(
      `INSERT INTO product_images (product_id, variant_id, image_url, alt_text, is_primary, sort_order) VALUES
         ($1, NULL, 'https://cdn.example.com/2.jpg', 'Side', FALSE, 0),
         ($1, $2,   'https://cdn.example.com/1.jpg', 'Front', TRUE, 1)`,
      [product.id, variants[1].id]
    );
    await query("INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES ($1, 'CPU', 'i7')", [product.id]);
    await query("INSERT INTO product_key_features (product_id, feature) VALUES ($1, 'Backlit keyboard')", [product.id]);
    return { product, variants, b1, b2, closed };
  };

  test('backwards-compatible detail with sale-aware prices and new fields', async () => {
    const { product, variants, b1, b2 } = await build();
    await sale(variants[0].id, 55000, past(), future(3));

    const d = (await api.get(`${P}/${product.slug}`).expect(200)).body.data;
    for (const k of ['id', 'name', 'slug', 'short_description', 'description_md', 'condition', 'condition_label', 'brand', 'brand_slug', 'category', 'category_slug', 'meta_title', 'meta_description', 'variants', 'specifications', 'key_features', 'images']) {
      expect(d).toHaveProperty(k);
    }
    expect(d).toMatchObject({
      condition: 'used', condition_code: 'used', condition_label: 'Pre-Owned', brand: 'Dell',
      warranty_months: 6, warranty_type: 'shop', warranty_notes: 'Parts only', condition_grade: 'A',
      battery_health: 88, battery_cycles: 210, accessories: 'Charger', badge: 'Best value',
      og_image_url: 'https://cdn.example.com/og.jpg',
    });

    expect(d.variants.map((v) => v.sku)).toEqual(['L-8', 'L-16']); // cheapest first, inactive omitted
    const [v8, v16] = d.variants;
    expect(v16).toMatchObject({ price: '55000.00', regular_price: '60000.00', compare_at_price: '65000.00', is_on_sale: true, available: 5 });
    expect(new Date(v16.sale_ends_at).getTime()).toBeGreaterThan(Date.now());
    expect(v8).toMatchObject({ price: '50000.00', regular_price: '50000.00', is_on_sale: false, sale_ends_at: null });

    // Active branches only, 0 where nothing is stocked.
    expect(d.branch_availability).toEqual([
      { branch_id: b1.id, branch_name: 'Agrabad', available: 1 },
      { branch_id: b2.id, branch_name: 'GEC Circle', available: 1 },
    ]);
    expect(v16.branch_availability).toEqual([
      { branch_id: b1.id, branch_name: 'Agrabad', available: 1 },
      { branch_id: b2.id, branch_name: 'GEC Circle', available: 0 },
    ]);

    expect(d.images).toEqual(['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']);
    expect(d.image_list).toEqual([
      { url: 'https://cdn.example.com/1.jpg', alt_text: 'Front', is_primary: true, variant_id: variants[1].id },
      { url: 'https://cdn.example.com/2.jpg', alt_text: 'Side', is_primary: false, variant_id: null },
    ]);
    expect(d.specifications).toEqual([{ key: 'CPU', value: 'i7' }]);
    expect(d.key_features).toEqual(['Backlit keyboard']);
    expect(JSON.stringify(d)).not.toMatch(/cost_price|41234/);
  });

  test('a sale scheduled for the future is not exposed', async () => {
    const { product, variants } = await build();
    await sale(variants[0].id, 55000, future(1), future(3));
    const v16 = (await api.get(`${P}/${product.slug}`).expect(200)).body.data.variants.find((v) => v.sku === 'L-16');
    expect(v16).toMatchObject({ price: '60000.00', is_on_sale: false, sale_ends_at: null });
    expect(JSON.stringify(v16)).not.toMatch(/55000/);
  });

  test('rating comes from approved reviews only', async () => {
    const { product } = await build();
    const { user: u1 } = await f.user();
    const { user: u2 } = await f.user();
    const { user: u3 } = await f.user();
    await query(
      `INSERT INTO reviews (product_id, user_id, rating, is_approved) VALUES
         ($1, $2, 5, TRUE), ($1, $3, 4, TRUE), ($1, $4, 1, FALSE)`,
      [product.id, u1.id, u2.id, u3.id]
    );
    const d = (await api.get(`${P}/${product.slug}`).expect(200)).body.data;
    expect(d.rating).toEqual({ average: 4.5, count: 2 });
  });

  test('inactive or soft-deleted products are 404', async () => {
    const { product } = await build();
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);
    await api.get(`${P}/${product.slug}`).expect(404);
    await query('UPDATE products SET is_active = TRUE, deleted_at = NOW() WHERE id = $1', [product.id]);
    await api.get(`${P}/${product.slug}`).expect(404);
    await api.get(`${P}/does-not-exist`).expect(404);
  });

  test('a product with no variants still lists every active branch', async () => {
    const b = await f.branch({ name: 'Solo' });
    const cat = await f.category();
    await query("INSERT INTO products (name, slug, category_id) VALUES ('Bare', 'bare', $1)", [cat.id]);
    const d = (await api.get(`${P}/bare`).expect(200)).body.data;
    expect(d.variants).toEqual([]);
    expect(d.branch_availability).toEqual([{ branch_id: b.id, branch_name: 'Solo', available: 0 }]);
    expect(d.rating).toEqual({ average: null, count: 0 });
  });
});

describe('GET /products/:id/variants', () => {
  test('effective prices for active products only; no cost price', async () => {
    const branch = await f.branch();
    const { product, variants: [v] } = await f.product({ variants: [{ price: 1000, stock: [{ branch_id: branch.id, quantity: 3, reserved: 1 }] }, { is_active: false }] });
    // A value that can't appear by chance inside a UUID or timestamp.
    await query('UPDATE product_variants SET cost_price = 777.77 WHERE id = $1', [v.id]);
    await sale(v.id, 900, past(), future());

    const res = await api.get(`${P}/${product.id}/variants`).expect(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: v.id, price: '900.00', compare_at_price: '1000.00', regular_price: '1000.00', is_on_sale: true, available: 2 }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/cost_price|777\.77/);

    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);
    expect((await api.get(`${P}/${product.id}/variants`).expect(200)).body.data).toEqual([]);
    await api.get(`${P}/not-a-uuid/variants`).expect(400);
  });
});
