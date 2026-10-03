const { api, query, resetDb, factories: f } = require('../helpers');
const { actors } = require('./_actors');

beforeEach(resetDb);

const P = '/api/v1/products';
const SYSTEM = /^PG-\d+$/;

const payload = (a, cat, variants) => ({ name: 'HP ProBook 450 G8', category_id: cat.id, condition: 'used', variants });

describe('system-generated SKUs (PG-10001, …)', () => {
  test('variants created without a SKU get unique, increasing PG- codes', async () => {
    const a = await actors();
    const cat = await f.category();
    const res = await api.post(P).set(a.ba).send(payload(a, cat, [
      { variant_name: '8GB / 256GB', price: 44000, stock: [{ branch_id: a.branch.id, quantity: 1 }] },
      { variant_name: '16GB / 512GB', price: 52000 },
    ])).expect(201);
    const skus = res.body.data.variants.map((v) => v.sku);
    expect(skus.every((s) => SYSTEM.test(s))).toBe(true);
    const [first, second] = skus.map((s) => Number(s.slice(3)));
    expect(first).toBeGreaterThanOrEqual(10001);
    expect(second).toBeGreaterThan(first);

    const added = await api.post(`${P}/${res.body.data.id}/variants`).set(a.ba)
      .send({ variant_name: '32GB / 1TB', price: 65000 }).expect(201);
    expect(added.body.data.sku).toMatch(SYSTEM);
    expect(Number(added.body.data.sku.slice(3))).toBeGreaterThan(second);
  });

  test('the PG-<digits> pattern is reserved; other manual SKUs (imports) still work', async () => {
    const a = await actors();
    const cat = await f.category();
    const bad = await api.post(P).set(a.ba).send(payload(a, cat, [{ sku: 'pg-99999', variant_name: 'X', price: 1000 }])).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/assigned automatically/);

    const ok = await api.post(P).set(a.ba).send(payload(a, cat, [{ sku: 'IMPORT-HP-450', variant_name: 'X', price: 1000 }])).expect(201);
    const variant = ok.body.data.variants[0];
    expect(variant.sku).toBe('IMPORT-HP-450');
    await api.put(`${P}/variants/${variant.id}`).set(a.ba).send({ sku: 'PG-10001' }).expect(400);
  });

  test('POS: typing just the number finds the PG- SKU as an exact match', async () => {
    const a = await actors();
    const cat = await f.category();
    const res = await api.post(P).set(a.ba).send(payload(a, cat, [
      { variant_name: 'Default', price: 44000, stock: [{ branch_id: a.branch.id, quantity: 2 }] },
    ])).expect(201);
    const { id, sku } = res.body.data.variants[0];
    const digits = sku.slice(3);

    for (const q of [digits, sku, sku.toLowerCase()]) {
      const hit = await api.get(`/api/v1/pos/catalog?q=${q}`).set(a.ba).expect(200);
      expect(hit.body.data[0]).toMatchObject({ variant_id: id, sku, exact_sku: true, available: 2 });
    }
    // A number that isn't a SKU finds nothing (no partial PG- matches by number).
    const none = await api.get('/api/v1/pos/catalog?q=1').set(a.ba).expect(200);
    expect(none.body.data.filter((r) => r.exact_sku)).toEqual([]);
    expect((await query('SELECT COUNT(*)::int AS n FROM product_variants')).rows[0].n).toBe(1);
  });
});
