const config = require('../../src/config');
const { api, query, resetDb, factories: f } = require('../helpers');
const { actors, auditFor, orderLine } = require('./_actors');

beforeEach(resetDb);

const P = '/api/v1/products';
const UNKNOWN = '7d1f0c1e-8b9a-4c55-9a0e-2a3f8a7b6c5d';

const fullPayload = (a, cat, brand, overrides = {}) => ({
  name: 'ThinkPad X1 Carbon Gen 9',
  short_description: 'Ultralight business laptop',
  description_md: '## Great keyboard',
  category_id: cat.id,
  brand_id: brand.id,
  condition: 'used',
  condition_grade: 'a+',
  battery_health: 91,
  battery_cycles: 120,
  accessories: 'Original charger',
  warranty_months: 3,
  warranty_type: 'shop',
  badge: 'Hot deal',
  sort_order: 2,
  is_featured: true,
  variants: [
    {
      sku: 'X1-16-512',
      variant_name: '16GB / 512GB',
      price: 85000,
      compare_at_price: 95000,
      cost_price: 70000,
      attributes: [{ attribute_key: 'RAM', attribute_value: '16GB' }, { attribute_key: 'SSD', attribute_value: '512GB' }],
      stock: [{ branch_id: a.branch.id, quantity: 2 }],
    },
    { sku: 'X1-8-256', variant_name: '8GB / 256GB', price: 70000 },
  ],
  specifications: [{ spec_key: 'CPU', spec_value: 'i7-1165G7' }, { spec_key: 'Display', spec_value: '14" FHD' }],
  key_features: ['Backlit keyboard', { feature: 'Fingerprint reader' }],
  images: [
    { image_url: 'https://cdn.example.com/x1-front.jpg', alt_text: 'Front' },
    { image_url: 'https://cdn.example.com/x1-side.jpg', variant_sku: 'X1-8-256' },
  ],
  ...overrides,
});

const setup = async () => {
  const a = await actors();
  const cat = await f.category({ slug: 'laptops' });
  const brand = await f.brand({ slug: 'lenovo' });
  return { a, cat, brand };
};

describe('POST /products', () => {
  test('creates product + variants + attributes + stock + specs + features + images in one go', async () => {
    const { a, cat, brand } = await setup();
    const res = await api.post(P).set(a.ba).send(fullPayload(a, cat, brand)).expect(201);
    const d = res.body.data;

    expect(d).toMatchObject({
      slug: 'thinkpad-x1-carbon-gen-9',
      condition: 'used',
      condition_grade: 'A+',
      battery_health: 91,
      warranty_type: 'shop',
      badge: 'Hot deal',
      is_featured: true,
    });
    expect(d.variants).toHaveLength(2);
    const v1 = d.variants.find((v) => v.sku === 'X1-16-512');
    expect(v1.cost_price).toBe('70000.00');
    expect(v1.attributes.map((x) => x.attribute_key)).toEqual(['RAM', 'SSD']);
    expect(v1.inventory).toEqual([expect.objectContaining({ branch_id: a.branch.id, quantity: 2, reserved: 0, available: 2 })]);
    expect(v1.inventory[0].id).toBeTruthy();
    expect(d.specifications.map((s) => [s.spec_key, s.sort_order])).toEqual([['CPU', 0], ['Display', 1]]);
    expect(d.key_features.map((k) => k.feature)).toEqual(['Backlit keyboard', 'Fingerprint reader']);
    expect(d.images.map((i) => i.is_primary)).toEqual([true, false]);
    const v2 = d.variants.find((v) => v.sku === 'X1-8-256');
    expect(d.images[1].variant_id).toBe(v2.id);

    const moves = await query('SELECT movement_type, quantity_delta, performed_by FROM stock_movements');
    expect(moves.rows).toEqual([{ movement_type: 'adjustment', quantity_delta: 2, performed_by: a.users.ba.id }]);
    expect((await auditFor(d.id)).map((r) => r.action)).toEqual(['product.create']);
  });

  test('authz matrix', async () => {
    const { a, cat } = await setup();
    const body = { name: 'Plain product', category_id: cat.id };
    await api.post(P).send(body).expect(401);
    await api.post(P).set(a.cust).send(body).expect(403);
    await api.post(P).set(a.ba).send(body).expect(201);
    await api.post(P).set(a.sa).send(body).expect(201);
  });

  test('slug auto-generated with -2 on collision; explicit duplicate slug → 409', async () => {
    const { a, cat } = await setup();
    const r1 = await api.post(P).set(a.ba).send({ name: 'MacBook Air M2', category_id: cat.id }).expect(201);
    const r2 = await api.post(P).set(a.ba).send({ name: 'MacBook Air M2', category_id: cat.id }).expect(201);
    expect([r1.body.data.slug, r2.body.data.slug]).toEqual(['macbook-air-m2', 'macbook-air-m2-2']);
    await api.post(P).set(a.ba).send({ name: 'Other', slug: 'macbook-air-m2', category_id: cat.id }).expect(409);
  });

  test('slugs that collide with static routes are never used', async () => {
    const { a, cat } = await setup();
    const r = await api.post(P).set(a.ba).send({ name: 'Featured', category_id: cat.id, variants: [{ sku: 'F-1', variant_name: 'v', price: 10 }] }).expect(201);
    expect(r.body.data.slug).toBe('featured-2');
    await api.get(`${P}/featured-2`).expect(200);
    await api.post(P).set(a.ba).send({ name: 'Search', slug: 'search', category_id: cat.id }).expect(400);
    await api.put(`${P}/${r.body.data.id}`).set(a.ba).send({ slug: 'admin' }).expect(400);
  });

  test('branch staff may only stock their own branch; branches/category/brand must exist', async () => {
    const { a, cat, brand } = await setup();
    const variant = (branch_id) => ({ sku: `S-${Math.random().toString(36).slice(2, 8)}`, variant_name: 'Base', price: 1000, stock: [{ branch_id, quantity: 1 }] });

    await api.post(P).set(a.ba).send({ name: 'Mouse', category_id: cat.id, variants: [variant(a.otherBranch.id)] }).expect(403);
    await api.post(P).set(a.sa).send({ name: 'Mouse', category_id: cat.id, variants: [variant(a.otherBranch.id)] }).expect(201);
    await api.post(P).set(a.sa).send({ name: 'Mouse', category_id: cat.id, variants: [variant(UNKNOWN)] }).expect(400);
    await api.post(P).set(a.sa).send({ name: 'Mouse', category_id: UNKNOWN }).expect(400);
    await api.post(P).set(a.sa).send({ name: 'Mouse', category_id: cat.id, brand_id: UNKNOWN }).expect(400);
    await api.post(P).set(a.sa).send({ name: 'Mouse', category_id: cat.id, brand_id: brand.id }).expect(201);
  });

  test('pricing rules: compare_at > price, sale < price, sale window ends after start', async () => {
    const { a, cat } = await setup();
    const withVariant = (v) => ({ name: 'Priced', category_id: cat.id, variants: [{ sku: 'P-1', variant_name: 'Base', price: 1000, ...v }] });

    await api.post(P).set(a.ba).send(withVariant({ compare_at_price: 1000 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ compare_at_price: 999 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ sale_price: 1000 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ sale_price: 1200 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({
      sale_price: 900, sale_starts_at: '2026-12-10T00:00:00Z', sale_ends_at: '2026-12-01T00:00:00Z',
    })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ sale_price: 900, sale_starts_at: 'next tuesday' })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ price: -5 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ price: 0 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ price: 10.555 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ price: '1000' })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ price: 1e12 })).expect(400);
    await api.post(P).set(a.ba).send(withVariant({ cost_price: -1 })).expect(400);

    const ok = await api.post(P).set(a.ba).send(withVariant({
      compare_at_price: 1200, sale_price: 900,
      sale_starts_at: '2026-12-01T00:00:00+06:00', sale_ends_at: '2026-12-10T00:00:00+06:00',
    })).expect(201);
    expect(ok.body.data.variants[0]).toMatchObject({ sale_price: '900.00', compare_at_price: '1200.00' });
    expect(await query('SELECT 1 FROM products WHERE name = $1', ['Priced'])).toHaveProperty('rowCount', 1);
  });

  test('SKUs unique (case-insensitive) → 409, and a failed create leaves nothing behind', async () => {
    const { a, cat } = await setup();
    await f.product({ category_id: cat.id, variants: [{ sku: 'TAKEN-1' }] });

    const dupInPayload = {
      name: 'Dup', category_id: cat.id,
      variants: [{ sku: 'NEW-1', variant_name: 'A', price: 10 }, { sku: 'new-1', variant_name: 'B', price: 10 }],
    };
    await api.post(P).set(a.ba).send(dupInPayload).expect(409);

    const clash = {
      name: 'Clash', category_id: cat.id,
      variants: [{ sku: 'FRESH-1', variant_name: 'A', price: 10 }, { sku: 'taken-1', variant_name: 'B', price: 10 }],
    };
    await api.post(P).set(a.ba).send(clash).expect(409);
    const left = await query("SELECT COUNT(*)::int AS n FROM products WHERE name IN ('Dup', 'Clash')");
    expect(left.rows[0].n).toBe(0);
    const v = await query("SELECT COUNT(*)::int AS n FROM product_variants WHERE sku = 'FRESH-1'");
    expect(v.rows[0].n).toBe(0);
  });

  test('two concurrent creates with the same SKU: exactly one wins', async () => {
    const { a, cat } = await setup();
    const body = (name) => ({ name, category_id: cat.id, variants: [{ sku: 'RACE-1', variant_name: 'A', price: 10 }] });
    const res = await Promise.all([api.post(P).set(a.ba).send(body('Racer A')), api.post(P).set(a.sa).send(body('Racer B'))]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await query("SELECT COUNT(*)::int AS n FROM product_variants WHERE sku = 'RACE-1'")).rows[0].n).toBe(1);
  });

  test('validation: types, arrays, oversize, enums, mass-assignment stripped', async () => {
    const { a, cat } = await setup();
    const base = { name: 'Valid name', category_id: cat.id };
    await api.post(P).set(a.ba).send({ ...base, name: 'X' }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, name: ['a', 'b'] }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, condition: 'broken' }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, battery_health: 101 }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, battery_health: -1 }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, warranty_type: 'lifetime' }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, warranty_months: 500 }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, condition_grade: 'Z' }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, badge: 'B'.repeat(41) }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, og_image_url: 'javascript:alert(1)' }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, images: [{ image_url: 'javascript:alert(1)' }] }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, variants: Array.from({ length: 51 }, (_, i) => ({ sku: `S${i}`, variant_name: 'v', price: 1 })) }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, variants: [{ sku: 'bad sku!', variant_name: 'v', price: 1 }] }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, variants: [{ sku: 'S1', variant_name: 'v', price: 1, stock: [{ branch_id: a.branch.id, quantity: -1 }] }] }).expect(400);
    await api.post(P).set(a.ba).send({ ...base, images: [{ image_url: 'https://x.example/a.jpg', variant_sku: 'NOPE' }] }).expect(400);

    const res = await api.post(P).set(a.ba)
      .send({ ...base, refurbished: true, deleted_at: '2020-01-01T00:00:00Z', id: UNKNOWN, created_at: '2000-01-01' })
      .expect(201);
    expect(res.body.data.deleted_at).toBeNull();
    expect(res.body.data.id).not.toBe(UNKNOWN);
  });

  test('new conditions refurbished / open_box are accepted', async () => {
    const { a, cat } = await setup();
    const r = await api.post(P).set(a.ba).send({ name: 'Refurb', category_id: cat.id, condition: 'refurbished' }).expect(201);
    expect(r.body.data).toMatchObject({ condition: 'refurbished', condition_label: 'Refurbished' });
    const o = await api.post(P).set(a.ba).send({ name: 'Open', category_id: cat.id, condition: 'open_box' }).expect(201);
    expect(o.body.data.condition_label).toBe('Open Box');
  });
});

describe('PUT /products/:id and DELETE', () => {
  test('partial update keeps slug; slug change must be unique; refs validated; audited', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id, name: 'Old Name' });
    const { product: other } = await f.product({ category_id: cat.id });

    await api.put(`${P}/${product.id}`).send({ name: 'New' }).expect(401);
    await api.put(`${P}/${product.id}`).set(a.cust).send({ name: 'New' }).expect(403);
    await api.put(`${P}/${product.id}`).set(a.ba).send({}).expect(400);

    const r = await api.put(`${P}/${product.id}`).set(a.ba).send({ name: 'New Name', warranty_months: 6, badge: '' }).expect(200);
    expect(r.body.data).toMatchObject({ name: 'New Name', slug: product.slug, warranty_months: 6, badge: null });

    await api.put(`${P}/${product.id}`).set(a.ba).send({ slug: other.slug }).expect(409);
    await api.put(`${P}/${product.id}`).set(a.ba).send({ category_id: UNKNOWN }).expect(400);
    const s = await api.put(`${P}/${product.id}`).set(a.ba).send({ slug: 'new-name' }).expect(200);
    expect(s.body.data.slug).toBe('new-name');
    await api.get(`${P}/new-name`).expect(200);
    await api.put(`${P}/${UNKNOWN}`).set(a.ba).send({ name: 'Ghost' }).expect(404);

    expect((await auditFor(product.id)).map((x) => x.action)).toEqual(['product.update', 'product.update']);
  });

  test('soft delete: super_admin only, hidden publicly and from admin, kept in DB', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });

    await api.delete(`${P}/${product.id}`).expect(401);
    await api.delete(`${P}/${product.id}`).set(a.cust).expect(403);
    await api.delete(`${P}/${product.id}`).set(a.ba).expect(403);
    await api.delete(`${P}/${product.id}`).set(a.sa).expect(200);
    await api.delete(`${P}/${product.id}`).set(a.sa).expect(404);

    const row = (await query('SELECT deleted_at, is_active FROM products WHERE id = $1', [product.id])).rows[0];
    expect(row.deleted_at).not.toBeNull();
    expect(row.is_active).toBe(false);

    await api.get(`${P}/${product.slug}`).expect(404);
    expect((await api.get(P).expect(200)).body.data).toHaveLength(0);
    expect((await api.get(`${P}/${product.id}/variants`).expect(200)).body.data).toHaveLength(0);
    expect((await api.get(`${P}/admin?status=all`).set(a.ba).expect(200)).body.data).toHaveLength(0);
    await api.get(`${P}/admin/${product.id}`).set(a.ba).expect(404);
    await api.put(`${P}/${product.id}`).set(a.ba).send({ name: 'Revive' }).expect(404);
    expect((await auditFor(product.id)).map((x) => x.action)).toEqual(['product.delete']);
  });

  test('deleting frees the slug and SKUs for a new product; the audit keeps the originals', async () => {
    const { a, cat } = await setup();
    const { product, variants: [v] } = await f.product({ category_id: cat.id, name: 'ThinkPad T14', variants: [{ sku: 'TP-T14-16' }] });
    await api.delete(`${P}/${product.id}`).set(a.sa).expect(200);

    const old = (await query('SELECT slug FROM products WHERE id = $1', [product.id])).rows[0];
    expect(old.slug).toBe(`${product.slug}~d${product.id.slice(0, 8)}`);
    const oldVariant = (await query('SELECT sku FROM product_variants WHERE id = $1', [v.id])).rows[0];
    expect(oldVariant.sku).toBe(`TP-T14-16~d${product.id.slice(0, 8)}`);
    const [entry] = await auditFor(product.id);
    expect(entry.data).toEqual({ slug: product.slug, skus: ['TP-T14-16'] });

    const res = await api.post(P).set(a.sa).send({
      name: 'ThinkPad T14', slug: product.slug, category_id: cat.id, condition: 'used',
      variants: [{ sku: 'TP-T14-16', variant_name: '16GB', price: 60000 }],
    }).expect(201);
    expect(res.body.data.slug).toBe(product.slug);
    await api.get(`${P}/${product.slug}`).expect(200);
  });
});

describe('variants', () => {
  test('POST /:id/variants: creates with attributes and own-branch stock; 409 on SKU clash', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id, variants: [{ sku: 'BASE-1' }] });

    const body = { sku: 'NEW-1', variant_name: 'Silver', color: 'Silver', price: 1000, attributes: [{ attribute_key: 'Color', attribute_value: 'Silver' }], stock: [{ branch_id: a.branch.id, quantity: 3 }] };
    await api.post(`${P}/${product.id}/variants`).set(a.cust).send(body).expect(403);
    await api.post(`${P}/${product.id}/variants`).set(a.baOther).send(body).expect(403); // stock in someone else's branch
    const r = await api.post(`${P}/${product.id}/variants`).set(a.ba).send(body).expect(201);
    expect(r.body.data).toMatchObject({ sku: 'NEW-1', color: 'Silver', total_stock: 3 });
    expect(r.body.data.attributes).toHaveLength(1);

    await api.post(`${P}/${product.id}/variants`).set(a.ba).send({ ...body, stock: undefined }).expect(409);
    await api.post(`${P}/${product.id}/variants`).set(a.ba).send({ ...body, sku: 'base-1', stock: undefined }).expect(409);
    await api.post(`${P}/${UNKNOWN}/variants`).set(a.ba).send({ ...body, sku: 'X-9', stock: undefined }).expect(404);
  });

  test('PUT /variants/:id: pricing checked against merged state; attributes replaced; audited with before/after', async () => {
    const { a, cat } = await setup();
    const { variants: [v] } = await f.product({ category_id: cat.id, variants: [{ price: 50000, compare_at_price: 60000 }] });
    await query("INSERT INTO variant_attributes (variant_id, attribute_key, attribute_value) VALUES ($1, 'RAM', '8GB')", [v.id]);

    await api.put(`${P}/variants/${v.id}`).send({ price: 1 }).expect(401);
    await api.put(`${P}/variants/${v.id}`).set(a.cust).send({ price: 1 }).expect(403);
    await api.put(`${P}/variants/${v.id}`).set(a.ba).send({}).expect(400);
    // Branch staff may change prices, cost included (still rule-checked).
    await api.put(`${P}/variants/${v.id}`).set(a.ba).send({ price: 65000 }).expect(400);
    await api.put(`${P}/variants/${v.id}`).set(a.ba).send({ cost_price: -1 }).expect(400);
    // price above the stored compare-at price
    await api.put(`${P}/variants/${v.id}`).set(a.sa).send({ price: 65000 }).expect(400);
    // sale price above the stored price
    await api.put(`${P}/variants/${v.id}`).set(a.sa).send({ sale_price: 55000 }).expect(400);
    await api.put(`${P}/variants/${v.id}`).set(a.sa).send({ sale_starts_at: '2026-12-10T00:00:00Z', sale_ends_at: '2026-12-01T00:00:00Z' }).expect(400);

    const r = await api.put(`${P}/variants/${v.id}`).set(a.sa).send({
      price: 65000, compare_at_price: null, sale_price: 59000, cost_price: 40000,
      attributes: [{ attribute_key: 'RAM', attribute_value: '16GB' }, { attribute_key: 'SSD', attribute_value: '1TB' }],
    }).expect(200);
    expect(r.body.data).toMatchObject({ price: '65000.00', compare_at_price: null, sale_price: '59000.00', cost_price: '40000.00', effective_price: '59000.00', is_on_sale: true });
    expect(r.body.data.attributes.map((x) => `${x.attribute_key}=${x.attribute_value}`)).toEqual(['RAM=16GB', 'SSD=1TB']);

    // Ending a sale window before the stored start is rejected.
    await api.put(`${P}/variants/${v.id}`).set(a.sa).send({ sale_starts_at: '2026-12-10T00:00:00Z' }).expect(200);
    await api.put(`${P}/variants/${v.id}`).set(a.sa).send({ sale_ends_at: '2026-12-09T00:00:00Z' }).expect(400);

    const log = await auditFor(v.id);
    expect(log[0]).toMatchObject({ action: 'variant.update' });
    expect(log[0].data.before).toMatchObject({ price: '50000.00', compare_at_price: '60000.00' });
    expect(log[0].data.after).toMatchObject({ price: 65000 });
    await api.put(`${P}/variants/${UNKNOWN}`).set(a.ba).send({ price: 1 }).expect(404);
  });

  test('PUT /variants/:id: SKU change must stay unique', async () => {
    const { a, cat } = await setup();
    const { variants: [v1, v2] } = await f.product({ category_id: cat.id, variants: [{ sku: 'ONE' }, { sku: 'TWO' }] });
    await api.put(`${P}/variants/${v2.id}`).set(a.ba).send({ sku: 'one' }).expect(409);
    await api.put(`${P}/variants/${v2.id}`).set(a.ba).send({ sku: 'TWO' }).expect(200);
    const r = await api.put(`${P}/variants/${v2.id}`).set(a.ba).send({ sku: 'TWO-B' }).expect(200);
    expect(r.body.data.sku).toBe('TWO-B');
    expect(v1.id).toBeTruthy();
  });

  test('DELETE /variants/:id: hard delete when unused, deactivate when ordered or stocked', async () => {
    const { a, cat } = await setup();
    const { variants: [unused, ordered, stocked] } = await f.product({
      category_id: cat.id,
      variants: [{}, {}, { stock: [{ branch_id: a.branch.id, quantity: 1 }] }],
    });
    await orderLine(ordered.id, a.users.cust.id);

    await api.delete(`${P}/variants/${unused.id}`).set(a.ba).expect(403);
    const r1 = await api.delete(`${P}/variants/${unused.id}`).set(a.sa).expect(200);
    expect(r1.body.data).toMatchObject({ deleted: true, deactivated: false });
    expect((await query('SELECT 1 FROM product_variants WHERE id = $1', [unused.id])).rowCount).toBe(0);

    const r2 = await api.delete(`${P}/variants/${ordered.id}`).set(a.sa).expect(200);
    expect(r2.body.data).toMatchObject({ deleted: false, deactivated: true, reason: 'referenced_by_orders' });
    const r3 = await api.delete(`${P}/variants/${stocked.id}`).set(a.sa).expect(200);
    expect(r3.body.data).toMatchObject({ deleted: false, deactivated: true, reason: 'has_stock' });
    const left = await query('SELECT is_active FROM product_variants WHERE id = ANY($1)', [[ordered.id, stocked.id]]);
    expect(left.rows.every((r) => r.is_active === false)).toBe(true);
    await api.delete(`${P}/variants/${unused.id}`).set(a.sa).expect(404);
  });
});

describe('specifications & key features', () => {
  test('append, replace, delete (IDOR-safe)', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const { product: other } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/specifications`;

    await api.post(url).set(a.cust).send({ spec_key: 'CPU', spec_value: 'M2' }).expect(403);
    const s1 = await api.post(url).set(a.ba).send({ spec_key: 'CPU', spec_value: 'M2' }).expect(201);
    const s2 = await api.post(url).set(a.ba).send({ spec_key: 'RAM', spec_value: '8GB' }).expect(201);
    expect([s1.body.data.sort_order, s2.body.data.sort_order]).toEqual([0, 1]);
    await api.post(url).set(a.ba).send({ spec_key: '', spec_value: 'x' }).expect(400);

    // Deleting via another product's path is a 404, not a cross-product delete.
    await api.delete(`${P}/${other.id}/specifications/${s1.body.data.id}`).set(a.ba).expect(404);
    await api.delete(`${P}/${product.id}/specifications/${s1.body.data.id}`).set(a.ba).expect(200);
    await api.delete(`${P}/${product.id}/specifications/${s1.body.data.id}`).set(a.ba).expect(404);

    const rep = await api.put(url).set(a.ba).send({ specifications: [{ spec_key: 'Display', spec_value: '13.6"' }, { spec_key: 'Weight', spec_value: '1.24 kg' }] }).expect(200);
    expect(rep.body.data.map((s) => [s.spec_key, s.sort_order])).toEqual([['Display', 0], ['Weight', 1]]);
    await api.put(url).set(a.ba).send({ specifications: 'nope' }).expect(400);
    await api.put(url).set(a.ba).send({ specifications: Array.from({ length: 201 }, () => ({ spec_key: 'k', spec_value: 'v' })) }).expect(400);

    const detail = await api.get(`${P}/${product.slug}`).expect(200);
    expect(detail.body.data.specifications).toEqual([{ key: 'Display', value: '13.6"' }, { key: 'Weight', value: '1.24 kg' }]);
  });

  test('key features: append, replace with strings/objects, delete', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/key-features`;

    const k1 = await api.post(url).set(a.ba).send({ feature: 'Retina display' }).expect(201);
    expect(k1.body.data.sort_order).toBe(0);
    const rep = await api.put(url).set(a.ba).send({ key_features: ['All-day battery', { feature: 'MagSafe' }] }).expect(200);
    expect(rep.body.data.map((k) => k.feature)).toEqual(['All-day battery', 'MagSafe']);
    await api.put(url).set(a.ba).send({ key_features: [42] }).expect(400);
    await api.delete(`${url}/${rep.body.data[0].id}`).set(a.ba).expect(200);
    await api.delete(`${url}/${k1.body.data.id}`).set(a.ba).expect(404); // already replaced
    const detail = await api.get(`${P}/${product.slug}`).expect(200);
    expect(detail.body.data.key_features).toEqual(['MagSafe']);
  });
});

describe('images: exactly one primary', () => {
  const primaries = async (productId) =>
    (await query('SELECT id FROM product_images WHERE product_id = $1 AND is_primary', [productId])).rows.map((r) => r.id);

  test('first image becomes primary; a new primary replaces the old one', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/images`;

    const i1 = (await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/1.jpg' }).expect(201)).body.data;
    expect(i1.is_primary).toBe(true);
    const i2 = (await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/2.jpg', is_primary: false }).expect(201)).body.data;
    expect(i2.is_primary).toBe(false);
    expect(i2.sort_order).toBe(1);
    const i3 = (await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/3.jpg', is_primary: true }).expect(201)).body.data;
    expect(i3.is_primary).toBe(true);
    expect(await primaries(product.id)).toEqual([i3.id]);

    const list = (await api.patch(`${url}/${i2.id}`).set(a.ba).send({ is_primary: true }).expect(200)).body.data;
    expect(list.filter((i) => i.is_primary).map((i) => i.id)).toEqual([i2.id]);

    // Un-setting the primary promotes the next image by order.
    const after = (await api.patch(`${url}/${i2.id}`).set(a.ba).send({ is_primary: false, alt_text: 'Side view' }).expect(200)).body.data;
    expect(after.filter((i) => i.is_primary).map((i) => i.id)).toEqual([i1.id]);
    expect(after.find((i) => i.id === i2.id).alt_text).toBe('Side view');
  });

  test('deleting the primary promotes the next; the only image must stay primary', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/images`;
    const i1 = (await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/1.jpg' })).body.data;
    const i2 = (await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/2.jpg' })).body.data;

    const left = (await api.delete(`${url}/${i1.id}`).set(a.ba).expect(200)).body.data;
    expect(left).toEqual([expect.objectContaining({ id: i2.id, is_primary: true })]);
    await api.patch(`${url}/${i2.id}`).set(a.ba).send({ is_primary: false }).expect(400);
    await api.delete(`${url}/${i2.id}`).set(a.ba).expect(200);
    await api.delete(`${url}/${i2.id}`).set(a.ba).expect(404);
    expect(await primaries(product.id)).toEqual([]);
  });

  test('concurrent first uploads still produce exactly one primary', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const res = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => api.post(`${P}/${product.id}/images`).set(a.ba).send({ image_url: `https://cdn.example.com/${n}.jpg` }))
    );
    expect(res.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await primaries(product.id)).toHaveLength(1);
  });

  test('reorder must list every image exactly once', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const { product: other } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/images`;
    const ids = [];
    for (const n of [1, 2, 3]) ids.push((await api.post(url).set(a.ba).send({ image_url: `https://cdn.example.com/${n}.jpg` })).body.data.id);
    const foreign = (await api.post(`${P}/${other.id}/images`).set(a.ba).send({ image_url: 'https://cdn.example.com/o.jpg' })).body.data.id;

    await api.put(`${url}/order`).set(a.ba).send([ids[0], ids[1]]).expect(400);
    await api.put(`${url}/order`).set(a.ba).send([ids[0], ids[1], ids[1]]).expect(400);
    await api.put(`${url}/order`).set(a.ba).send([ids[0], ids[1], foreign]).expect(400);
    await api.put(`${url}/order`).set(a.ba).send(['nope']).expect(400);
    await api.put(`${url}/order`).set(a.cust).send([ids[2], ids[1], ids[0]]).expect(403);

    const r = await api.put(`${url}/order`).set(a.ba).send([ids[2], ids[0], ids[1]]).expect(200);
    expect(r.body.data.map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
    const r2 = await api.put(`${url}/order`).set(a.ba).send({ image_ids: [ids[0], ids[1], ids[2]] }).expect(200);
    expect(r2.body.data.map((i) => i.sort_order)).toEqual([0, 1, 2]);
    // Order changes never move the primary flag.
    expect(r.body.data.find((i) => i.is_primary).id).toBe(ids[0]);
  });

  test('source / variant / URL validation and IDOR', async () => {
    const { a, cat } = await setup();
    const { product, variants: [v] } = await f.product({ category_id: cat.id });
    const { product: other, variants: [ov] } = await f.product({ category_id: cat.id });
    const url = `${P}/${product.id}/images`;

    await api.post(url).send({ image_url: 'https://cdn.example.com/1.jpg' }).expect(401);
    await api.post(url).set(a.cust).send({ image_url: 'https://cdn.example.com/1.jpg' }).expect(403);
    await api.post(url).set(a.ba).send({}).expect(400);
    await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/1.jpg', media_id: UNKNOWN }).expect(400);
    await api.post(url).set(a.ba).send({ media_id: UNKNOWN }).expect(400);
    await api.post(url).set(a.ba).send({ image_url: 'javascript:alert(1)' }).expect(400);
    await api.post(url).set(a.ba).send({ image_url: 'ftp://cdn.example.com/1.jpg' }).expect(400);
    await api.post(url).set(a.ba).send({ image_url: 'https://cdn.example.com/1.jpg', variant_id: ov.id }).expect(400);

    const img = (await api.post(url).set(a.ba).send({ image_url: 'http://localhost:5001/uploads/a.webp', variant_id: v.id, alt_text: 'Lid' }).expect(201)).body.data;
    expect(img.variant_id).toBe(v.id);

    // Another product's path can't touch this image.
    await api.patch(`${P}/${other.id}/images/${img.id}`).set(a.ba).send({ alt_text: 'pwned' }).expect(404);
    await api.delete(`${P}/${other.id}/images/${img.id}`).set(a.ba).expect(404);
    await api.patch(`${url}/${img.id}`).set(a.ba).send({ variant_id: ov.id }).expect(400);
    await api.patch(`${url}/${img.id}`).set(a.ba).send({}).expect(400);
    const cleared = (await api.patch(`${url}/${img.id}`).set(a.ba).send({ variant_id: null }).expect(200)).body.data;
    expect(cleared[0].variant_id).toBeNull();
  });

  test('plain http image URLs are refused in production', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({ category_id: cat.id });
    const prev = config.isProd;
    config.isProd = true;
    try {
      await api.post(`${P}/${product.id}/images`).set(a.ba).send({ image_url: 'http://cdn.example.com/1.jpg' }).expect(400);
      await api.post(`${P}/${product.id}/images`).set(a.ba).send({ image_url: 'https://cdn.example.com/1.jpg' }).expect(201);
    } finally {
      config.isProd = prev;
    }
  });
});

describe('GET /products/admin', () => {
  test('rows carry the active-variant price range and condition grade', async () => {
    const { a, cat } = await setup();
    const { product } = await f.product({
      category_id: cat.id, condition: 'used',
      variants: [{ price: 100000 }, { price: 150000 }, { price: 999999, is_active: false }],
    });
    await query("UPDATE products SET condition_grade = 'A' WHERE id = $1", [product.id]);
    const row = (await api.get(`${P}/admin`).set(a.ba).expect(200)).body.data.find((r) => r.id === product.id);
    expect(row).toMatchObject({ min_price: '100000.00', max_price: '150000.00', condition_grade: 'A' });
  });

  test('authz, includes inactive, filters, counts, pagination', async () => {
    const { a, cat, brand } = await setup();
    const sub = await f.category({ slug: 'macbooks', parent_id: cat.id });
    const other = await f.category({ slug: 'audio' });
    const live = await f.product({
      category_id: sub.id, brand_id: brand.id, name: 'MacBook Pro', is_featured: true,
      variants: [{ sku: 'MBP-14', price: 200000, stock: [{ branch_id: a.branch.id, quantity: 3, reserved: 1 }] }, { is_active: false, stock: [{ branch_id: a.otherBranch.id, quantity: 2 }] }],
    });
    const off = await f.product({ category_id: other.id, name: 'Headphones', is_active: false, condition: 'used', variants: [{ stock: [{ branch_id: a.branch.id, quantity: 50 }] }] });

    await api.get(`${P}/admin`).expect(401);
    await api.get(`${P}/admin`).set(a.cust).expect(403);

    const all = await api.get(`${P}/admin`).set(a.ba).expect(200);
    expect(all.body.pagination.total).toBe(2);
    const row = all.body.data.find((r) => r.id === live.product.id);
    expect(row).toMatchObject({ variant_count: 2, active_variant_count: 1, total_stock: 5, available: 4, min_price: '200000.00', is_featured: true });
    expect(JSON.stringify(all.body)).not.toMatch(/cost_price/);

    const ids = async (qs) => (await api.get(`${P}/admin?${qs}`).set(a.ba).expect(200)).body.data.map((r) => r.id);
    expect(await ids('status=inactive')).toEqual([off.product.id]);
    expect(await ids('status=active')).toEqual([live.product.id]);
    expect(await ids('q=mbp-1')).toEqual([live.product.id]);
    expect(await ids('q=headph')).toEqual([off.product.id]);
    expect(await ids('q=%25')).toEqual([]);
    expect(await ids('category=laptops')).toEqual([live.product.id]);
    expect(await ids(`category=${other.id}`)).toEqual([off.product.id]);
    expect(await ids('brand=lenovo')).toEqual([live.product.id]);
    expect(await ids(`brand=${brand.id}`)).toEqual([live.product.id]);
    expect(await ids('condition=used')).toEqual([off.product.id]);
    expect(await ids('featured=true')).toEqual([live.product.id]);
    expect(await ids('featured=false')).toEqual([off.product.id]);
    expect(await ids('low_stock=true')).toEqual([live.product.id]); // 2 available <= threshold 5
    expect((await ids('sort=name')).length).toBe(2);

    const page = await api.get(`${P}/admin?limit=1&page=2&sort=name`).set(a.ba).expect(200);
    expect(page.body.data.map((r) => r.name)).toEqual(['MacBook Pro']);
    expect(page.body.pagination).toMatchObject({ page: 2, limit: 1, total: 2, hasPrev: true, hasNext: false });

    await api.get(`${P}/admin?status=deleted`).set(a.ba).expect(400);
    await api.get(`${P}/admin?q=a&q=b`).set(a.ba).expect(400);
    await api.get(`${P}/admin?limit=101`).set(a.ba).expect(400);
    await api.get(`${P}/admin?sort=random()`).set(a.ba).expect(400);
  });

  test('GET /admin/:id: full detail incl. inactive variants, cost price, inventory and child ids', async () => {
    const { a, cat } = await setup();
    const created = (await api.post(P).set(a.ba).send(fullPayload(a, cat, await f.brand()))).body.data;
    await query('UPDATE product_variants SET is_active = FALSE WHERE sku = $1', ['X1-8-256']);
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [created.id]);

    await api.get(`${P}/admin/${created.id}`).expect(401);
    await api.get(`${P}/admin/${created.id}`).set(a.cust).expect(403);
    await api.get(`${P}/admin/not-a-uuid`).set(a.ba).expect(400);
    await api.get(`${P}/admin/${UNKNOWN}`).set(a.ba).expect(404);

    const d = (await api.get(`${P}/admin/${created.id}`).set(a.ba).expect(200)).body.data;
    expect(d.is_active).toBe(false);
    expect(d.variants).toHaveLength(2);
    // Payload order is preserved.
    expect(d.variants.map((v) => v.sku)).toEqual(['X1-16-512', 'X1-8-256']);
    expect(d.variants[1].is_active).toBe(false);
    expect(d.variants[0]).toMatchObject({ cost_price: '70000.00', sale_price: null });
    expect(d.variants[0].inventory[0]).toHaveProperty('id');
    expect(d.images.every((i) => i.id)).toBe(true);
    expect(d.specifications.every((s) => s.id)).toBe(true);
    expect(d.key_features.every((k) => k.id)).toBe(true);
    expect(d.rating).toEqual({ average: null, count: 0 });
  });
});
