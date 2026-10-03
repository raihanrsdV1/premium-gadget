const { api, query, resetDb, factories: f } = require('../helpers');
const { actors, auditFor } = require('./_actors');

beforeEach(resetDb);

const C = '/api/v1/categories';
const B = '/api/v1/brands';

const setCat = (id, fields) => {
  const keys = Object.keys(fields);
  return query(
    `UPDATE categories SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [id, ...keys.map((k) => fields[k])]
  );
};

describe('categories — public', () => {
  test('lists active categories by sort_order then name, with product counts incl. direct children', async () => {
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    const macbooks = await f.category({ name: 'MacBooks', slug: 'macbooks', parent_id: laptops.id });
    const acc = await f.category({ name: 'Accessories', slug: 'accessories' });
    const hidden = await f.category({ name: 'Hidden', slug: 'hidden', is_active: false });
    await setCat(laptops.id, { sort_order: 2 });
    await setCat(macbooks.id, { sort_order: 1 });
    await setCat(acc.id, { sort_order: 2 });

    await f.product({ category_id: laptops.id });
    await f.product({ category_id: macbooks.id });
    await f.product({ category_id: macbooks.id, is_active: false }); // inactive: not counted
    await f.product({ category_id: macbooks.id, variants: [{ is_active: false }] }); // no active variant
    const gone = await f.product({ category_id: laptops.id });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [gone.product.id]);

    const res = await api.get(C).expect(200);
    expect(res.body.data.map((c) => c.slug)).toEqual(['macbooks', 'accessories', 'laptops']);
    expect(res.body.data.find((c) => c.slug === 'hidden')).toBeUndefined();
    const count = Object.fromEntries(res.body.data.map((c) => [c.slug, c.product_count]));
    expect(count).toEqual({ laptops: 2, macbooks: 1, accessories: 0 });
    expect(hidden.id).toBeTruthy();
  });

  test('?tree=true nests children and drops subtrees of inactive parents', async () => {
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    await f.category({ name: 'MacBooks', slug: 'macbooks', parent_id: laptops.id });
    const off = await f.category({ name: 'Old', slug: 'old', is_active: false });
    await f.category({ name: 'Orphan', slug: 'orphan', parent_id: off.id });

    const res = await api.get(`${C}?tree=true`).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('laptops');
    expect(res.body.data[0].children.map((c) => c.slug)).toEqual(['macbooks']);
  });

  test('query validation: arrays and junk → 400', async () => {
    await api.get(`${C}?tree=true&tree=false`).expect(400);
    await api.get(`${C}?tree=maybe`).expect(400);
  });

  test('get by slug or id; inactive → 404; malformed → 400', async () => {
    const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
    await f.category({ name: 'MacBooks', slug: 'macbooks', parent_id: laptops.id });
    const off = await f.category({ slug: 'off', is_active: false });

    const bySlug = await api.get(`${C}/laptops`).expect(200);
    expect(bySlug.body.data.id).toBe(laptops.id);
    expect(bySlug.body.data.children.map((c) => c.slug)).toEqual(['macbooks']);
    const byId = await api.get(`${C}/${laptops.id}`).expect(200);
    expect(byId.body.data.slug).toBe('laptops');
    const child = await api.get(`${C}/macbooks`).expect(200);
    expect(child.body.data.parent).toMatchObject({ id: laptops.id, slug: 'laptops' });

    await api.get(`${C}/off`).expect(404);
    await api.get(`${C}/${off.id}`).expect(404);
    await api.get(`${C}/Not%20A%20Slug!`).expect(400);
  });
});

describe('categories — staff', () => {
  test('GET /admin: authz matrix and includes inactive', async () => {
    const a = await actors();
    await f.category({ slug: 'live' });
    await f.category({ slug: 'dead', is_active: false });

    await api.get(`${C}/admin`).expect(401);
    await api.get(`${C}/admin`).set(a.cust).expect(403);
    const res = await api.get(`${C}/admin`).set(a.ba).expect(200);
    expect(res.body.data.map((c) => c.slug).sort()).toEqual(['dead', 'live']);
    expect(res.body.data[0]).toHaveProperty('total_product_count');
    expect(res.body.data[0]).toHaveProperty('children_count');
    await api.get(`${C}/admin`).set(a.sa).expect(200);
  });

  test('POST: authz matrix, auto slug with -2/-3 collisions, unknown keys stripped, audited', async () => {
    const a = await actors();
    const body = { name: 'Gaming Laptops' };
    await api.post(C).send(body).expect(401);
    await api.post(C).set(a.cust).send(body).expect(403);

    const r1 = await api.post(C).set(a.ba).send({ ...body, id: '00000000-0000-0000-0000-000000000000', created_at: '2000-01-01' }).expect(201);
    expect(r1.body.data.slug).toBe('gaming-laptops');
    expect(r1.body.data.id).not.toBe('00000000-0000-0000-0000-000000000000');
    const r2 = await api.post(C).set(a.sa).send(body).expect(201);
    expect(r2.body.data.slug).toBe('gaming-laptops-2');
    const r3 = await api.post(C).set(a.sa).send(body).expect(201);
    expect(r3.body.data.slug).toBe('gaming-laptops-3');

    const log = await auditFor(r1.body.data.id);
    expect(log).toEqual([expect.objectContaining({ action: 'category.create', actor_id: a.users.ba.id })]);
  });

  test('POST: concurrent creates with the same name all get distinct slugs', async () => {
    const a = await actors();
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => api.post(C).set(a.sa).send({ name: 'Monitors' }))
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(results.map((r) => r.body.data.slug).sort()).toEqual(['monitors', 'monitors-2', 'monitors-3', 'monitors-4']);
  });

  test('POST: explicit slug validated and unique; Bangla-only names still get a slug', async () => {
    const a = await actors();
    await api.post(C).set(a.sa).send({ name: 'Phones', slug: 'phones' }).expect(201);
    await api.post(C).set(a.sa).send({ name: 'Phones 2', slug: 'phones' }).expect(409);
    await api.post(C).set(a.sa).send({ name: 'Bad', slug: 'Bad Slug' }).expect(400);
    const bn = await api.post(C).set(a.sa).send({ name: 'ল্যাপটপ' }).expect(201);
    expect(bn.body.data.slug).toMatch(/^category-[0-9a-f]{6}$/);
    // "admin" would be shadowed by GET /categories/admin.
    const adm = await api.post(C).set(a.sa).send({ name: 'Admin' }).expect(201);
    expect(adm.body.data.slug).toBe('admin-2');
    await api.post(C).set(a.sa).send({ name: 'Admin', slug: 'admin' }).expect(400);
  });

  test('POST: field validation', async () => {
    const a = await actors();
    await api.post(C).set(a.sa).send({}).expect(400);
    await api.post(C).set(a.sa).send({ name: ['a', 'b'] }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'X'.repeat(121) }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'Icons', icon_url: 'javascript:alert(1)' }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'Icons', banner_url: 'data:image/png;base64,AAAA' }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'Icons', sort_order: 1.5 }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'Orphan', parent_id: '7d1f0c1e-8b9a-4c55-9a0e-2a3f8a7b6c5d' }).expect(400);
    await api.post(C).set(a.sa).send({ name: 'Orphan', parent_id: 'nope' }).expect(400);

    const ok = await api.post(C).set(a.sa).send({
      name: 'Tablets', icon_url: 'https://cdn.example.com/t.png', sort_order: 3, is_active: false,
      description: 'All tablets', meta_title: 'Tablets in Chattogram', meta_description: 'Buy tablets',
      banner_url: 'https://cdn.example.com/b.png',
    }).expect(201);
    expect(ok.body.data).toMatchObject({ is_active: false, sort_order: 3, meta_title: 'Tablets in Chattogram' });
  });

  test('PUT: rejects self-parent and descendant cycles; valid move works', async () => {
    const a = await actors();
    const top = await f.category({ slug: 'top' });
    const mid = await f.category({ slug: 'mid', parent_id: top.id });
    const leaf = await f.category({ slug: 'leaf', parent_id: mid.id });
    const other = await f.category({ slug: 'other' });

    await api.put(`${C}/${top.id}`).set(a.ba).send({ parent_id: top.id }).expect(400);
    await api.put(`${C}/${top.id}`).set(a.ba).send({ parent_id: mid.id }).expect(400);
    await api.put(`${C}/${top.id}`).set(a.ba).send({ parent_id: leaf.id }).expect(400);
    await api.put(`${C}/${top.id}`).set(a.ba).send({ parent_id: '7d1f0c1e-8b9a-4c55-9a0e-2a3f8a7b6c5d' }).expect(400);

    const moved = await api.put(`${C}/${leaf.id}`).set(a.ba).send({ parent_id: other.id }).expect(200);
    expect(moved.body.data.parent_id).toBe(other.id);
    const root = await api.put(`${C}/${mid.id}`).set(a.ba).send({ parent_id: null }).expect(200);
    expect(root.body.data.parent_id).toBeNull();
  });

  test('PUT: authz, slug uniqueness, partial update, 404, empty body', async () => {
    const a = await actors();
    const one = await f.category({ slug: 'one', name: 'One' });
    await f.category({ slug: 'two' });

    await api.put(`${C}/${one.id}`).send({ name: 'Uno' }).expect(401);
    await api.put(`${C}/${one.id}`).set(a.cust).send({ name: 'Uno' }).expect(403);
    await api.put(`${C}/${one.id}`).set(a.ba).send({}).expect(400);
    await api.put(`${C}/${one.id}`).set(a.ba).send({ slug: 'two' }).expect(409);
    await api.put(`${C}/not-a-uuid`).set(a.ba).send({ name: 'Uno' }).expect(400);
    await api.put(`${C}/7d1f0c1e-8b9a-4c55-9a0e-2a3f8a7b6c5d`).set(a.ba).send({ name: 'Uno' }).expect(404);

    const res = await api.put(`${C}/${one.id}`).set(a.ba).send({ name: 'Uno', slug: 'uno' }).expect(200);
    expect(res.body.data).toMatchObject({ name: 'Uno', slug: 'uno', is_active: true });
    const same = await api.put(`${C}/${one.id}`).set(a.ba).send({ slug: 'uno' }).expect(200);
    expect(same.body.data.slug).toBe('uno');
    expect((await auditFor(one.id)).map((r) => r.action)).toEqual(['category.update']);
  });

  test('DELETE: super_admin only; 409 while products or subcategories reference it', async () => {
    const a = await actors();
    const parent = await f.category({ slug: 'parent' });
    const child = await f.category({ slug: 'child', parent_id: parent.id });
    const used = await f.category({ slug: 'used' });
    const { product } = await f.product({ category_id: used.id });
    await query('UPDATE products SET deleted_at = NOW() WHERE id = $1', [product.id]); // still referenced
    const free = await f.category({ slug: 'free' });

    await api.delete(`${C}/${free.id}`).expect(401);
    await api.delete(`${C}/${free.id}`).set(a.cust).expect(403);
    await api.delete(`${C}/${free.id}`).set(a.ba).expect(403);

    const r1 = await api.delete(`${C}/${parent.id}`).set(a.sa).expect(409);
    expect(r1.body.message).toMatch(/deactivate/i);
    const r2 = await api.delete(`${C}/${used.id}`).set(a.sa).expect(409);
    expect(r2.body.message).toMatch(/1 product/);

    await api.delete(`${C}/${child.id}`).set(a.sa).expect(200);
    await api.delete(`${C}/${free.id}`).set(a.sa).expect(200);
    await api.delete(`${C}/${free.id}`).set(a.sa).expect(404);
    const left = await query('SELECT slug FROM categories ORDER BY slug');
    expect(left.rows.map((r) => r.slug)).toEqual(['parent', 'used']);
    expect((await auditFor(free.id)).map((r) => r.action)).toEqual(['category.delete']);
  });
});

describe('brands', () => {
  test('public list: active only, sorted, product counts; get by slug; inactive 404', async () => {
    const apple = await f.brand({ name: 'Apple', slug: 'apple' });
    const dell = await f.brand({ name: 'Dell', slug: 'dell' });
    await f.brand({ name: 'Gone', slug: 'gone', is_active: false });
    await query('UPDATE brands SET sort_order = 5 WHERE id = $1', [apple.id]);
    await f.product({ brand_id: dell.id });
    await f.product({ brand_id: dell.id, is_active: false });

    const res = await api.get(B).expect(200);
    expect(res.body.data.map((b) => b.slug)).toEqual(['dell', 'apple']);
    expect(res.body.data[0].product_count).toBe(1);

    await api.get(`${B}/apple`).expect(200);
    await api.get(`${B}/${dell.id}`).expect(200);
    await api.get(`${B}/gone`).expect(404);
    await api.get(`${B}?tree=1&tree=2`).expect(400);
  });

  test('admin list includes inactive; authz matrix', async () => {
    const a = await actors();
    await f.brand({ slug: 'on' });
    await f.brand({ slug: 'off', is_active: false });
    await api.get(`${B}/admin`).expect(401);
    await api.get(`${B}/admin`).set(a.cust).expect(403);
    const res = await api.get(`${B}/admin`).set(a.ba).expect(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('create/update: slugs, collisions, validation, audit', async () => {
    const a = await actors();
    await api.post(B).send({ name: 'Lenovo' }).expect(401);
    await api.post(B).set(a.cust).send({ name: 'Lenovo' }).expect(403);
    const r1 = await api.post(B).set(a.ba).send({ name: 'Lenovo', logo_url: 'https://cdn.example.com/l.png' }).expect(201);
    expect(r1.body.data.slug).toBe('lenovo');
    const r2 = await api.post(B).set(a.ba).send({ name: 'LENOVO' }).expect(201);
    expect(r2.body.data.slug).toBe('lenovo-2');
    await api.post(B).set(a.ba).send({ name: 'Bad', logo_url: 'javascript:alert(1)' }).expect(400);
    await api.post(B).set(a.ba).send({ name: 'Dup', slug: 'lenovo' }).expect(409);

    await api.put(`${B}/${r2.body.data.id}`).set(a.ba).send({ slug: 'lenovo' }).expect(409);
    const up = await api.put(`${B}/${r2.body.data.id}`).set(a.ba)
      .send({ name: 'Lenovo Legion', slug: 'legion', sort_order: 2, description: '' }).expect(200);
    expect(up.body.data).toMatchObject({ slug: 'legion', sort_order: 2, description: null });
    expect((await auditFor(r2.body.data.id)).map((r) => r.action)).toEqual(['brand.create', 'brand.update']);
  });

  test('delete: super_admin only; 409 when products use it', async () => {
    const a = await actors();
    const used = await f.brand();
    await f.product({ brand_id: used.id });
    const free = await f.brand();

    await api.delete(`${B}/${free.id}`).set(a.ba).expect(403);
    const res = await api.delete(`${B}/${used.id}`).set(a.sa).expect(409);
    expect(res.body.message).toMatch(/deactivate/i);
    await api.delete(`${B}/${free.id}`).set(a.sa).expect(200);
    await api.delete(`${B}/${free.id}`).set(a.sa).expect(404);
  });
});
