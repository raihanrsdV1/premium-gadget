const { api, resetDb, factories: f } = require('../helpers');

beforeEach(resetDb);

const P = '/api/v1/products';

describe('in_stock filter on public product lists', () => {
  test('in_stock=true keeps products with an available unit; false/absent keeps all; bad values 400', async () => {
    const branch = await f.branch();
    const { product: stocked } = await f.product({ name: 'Stocked Laptop', variants: [{ stock: [{ branch_id: branch.id, quantity: 2 }] }] });
    // Every unit reserved: not available.
    await f.product({ name: 'Reserved Laptop', variants: [{ stock: [{ branch_id: branch.id, quantity: 1, reserved: 1 }] }] });
    // Stock only on an inactive variant (the active one is empty).
    await f.product({ name: 'Inactive Variant Laptop', variants: [{ is_active: false, stock: [{ branch_id: branch.id, quantity: 5 }] }, {}] });
    await f.product({ name: 'Empty Laptop' });

    const ids = async (qs) => (await api.get(`${P}?${qs}`).expect(200)).body.data.map((r) => r.id);
    expect(await ids('in_stock=true')).toEqual([stocked.id]);
    expect((await api.get(`${P}?in_stock=true`).expect(200)).body.pagination.total).toBe(1);
    expect(await ids('in_stock=false')).toHaveLength(4);
    expect(await ids('')).toHaveLength(4);
    expect((await api.get(`${P}/search?q=laptop&in_stock=1`).expect(200)).body.data.map((r) => r.id)).toEqual([stocked.id]);
    await api.get(`${P}?in_stock=yes`).expect(400);
    await api.get(`${P}?in_stock=true&in_stock=false`).expect(400);
  });
});
