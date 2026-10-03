const { api, query, resetDb, factories: f } = require('../helpers');
const { actors, auditFor } = require('../catalog/_actors');
const { LAPTOP_TEMPLATE, setTemplate, specRows } = require('./_phase2');
const { templateSchema, groupSpecs, applyTemplate } = require('../../src/modules/categories/spec-template');

beforeEach(resetDb);

const C = '/api/v1/categories';
const P = '/api/v1/products';

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Laptops > Used Laptops > ThinkPads, plus an unrelated Audio category. */
const tree = async () => {
  const laptops = await f.category({ name: 'Laptops', slug: 'laptops' });
  const used = await f.category({ name: 'Used Laptops', slug: 'used-laptops', parent_id: laptops.id });
  const thinkpads = await f.category({ name: 'ThinkPads', slug: 'thinkpads', parent_id: used.id });
  const audio = await f.category({ name: 'Audio', slug: 'audio' });
  return { laptops, used, thinkpads, audio };
};

describe('template validation (schema)', () => {
  const ok = (t) => templateSchema.safeParse(t).success;
  const issues = (t) => templateSchema.safeParse(t).error?.issues.map((i) => i.message).join(' | ') || '';

  test('accepts the contract example and normalises fields', () => {
    const parsed = templateSchema.parse(LAPTOP_TEMPLATE);
    const cpu = parsed.groups[0].fields[0];
    expect(cpu).toEqual({ key: 'processor', label: 'Processor', type: 'text', unit: null, highlight: true, filterable: true });
    // highlight/filterable default to false; options only on select fields
    expect(parsed.groups[0].fields[1]).toEqual({
      key: 'cpu_generation', label: 'Generation', type: 'select', unit: null,
      options: ['8th Gen', '11th Gen', 'Apple M1'], highlight: false, filterable: false,
    });
    expect(ok({ groups: [] })).toBe(true);
  });

  test('rejects bad keys, labels, types, units, options and unknown properties', () => {
    const withField = (field) => ({ groups: [{ name: 'G', fields: [{ key: 'k', label: 'L', type: 'text', ...field }] }] });
    expect(ok(withField({ key: 'Bad Key' }))).toBe(false);
    expect(ok(withField({ key: 'x'.repeat(41) }))).toBe(false);
    expect(ok(withField({ key: '' }))).toBe(false);
    expect(ok(withField({ label: 'x'.repeat(61) }))).toBe(false);
    expect(ok(withField({ label: '' }))).toBe(false);
    expect(ok(withField({ type: 'date' }))).toBe(false);
    expect(ok(withField({ unit: 'x'.repeat(13) }))).toBe(false);
    expect(ok(withField({ options: ['a'] }))).toBe(false); // options on a text field
    expect(ok(withField({ type: 'select' }))).toBe(false); // select without options
    expect(ok(withField({ type: 'select', options: Array.from({ length: 51 }, (_, i) => `o${i}`) }))).toBe(false);
    expect(ok(withField({ type: 'select', options: ['A', 'a'] }))).toBe(false); // duplicate option
    expect(ok(withField({ highlight: 'yes' }))).toBe(false);
    expect(issues(withField({ hightlight: true }))).toMatch(/Unrecognized key/); // typo is an error, not silently dropped
    expect(ok({ groups: [], extra: 1 })).toBe(false);
    expect(ok({ groups: [{ name: 'G', fields: [], color: 'red' }] })).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok({})).toBe(false);
  });

  test('keys unique across the whole template; group names unique; ≤4 highlights; size limits', () => {
    const dupKey = clone(LAPTOP_TEMPLATE);
    dupKey.groups[3].fields.push({ key: 'ram', label: 'RAM again', type: 'text' });
    expect(issues(dupKey)).toMatch(/Duplicate field key "ram"/);

    const dupGroup = clone(LAPTOP_TEMPLATE);
    dupGroup.groups[3].name = 'display';
    expect(issues(dupGroup)).toMatch(/Duplicate group name/);

    const five = clone(LAPTOP_TEMPLATE);
    five.groups[3].fields[0].highlight = true;
    expect(issues(five)).toMatch(/At most 4 fields can be highlights/);

    const group = (i, n = 1) => ({ name: `G${i}`, fields: Array.from({ length: n }, (_, j) => ({ key: `k${i}_${j}`, label: 'L', type: 'text' })) });
    expect(ok({ groups: Array.from({ length: 20 }, (_, i) => group(i)) })).toBe(true);
    expect(ok({ groups: Array.from({ length: 21 }, (_, i) => group(i)) })).toBe(false);
    expect(ok({ groups: [group(0, 40)] })).toBe(true);
    expect(ok({ groups: [group(0, 41)] })).toBe(false);
    expect(ok({ groups: [{ name: 'x'.repeat(81), fields: [] }] })).toBe(false);
  });
});

describe('spec template helpers', () => {
  const tpl = templateSchema.parse(LAPTOP_TEMPLATE);

  test('applyTemplate fills group/highlight from matching field keys only', () => {
    const rows = applyTemplate(
      [
        { spec_key: 'CPU', spec_value: 'i5', field_key: 'processor', group_name: 'Wrong group' },
        { spec_key: 'Weight', spec_value: '1.4', field_key: 'weight' },
        { spec_key: 'Colour', spec_value: 'Black', group_name: 'Looks' },
        { spec_key: 'Orphan', spec_value: 'x', field_key: 'not_in_template' },
      ],
      tpl
    );
    expect(rows.map((r) => [r.group_name, r.field_key, r.is_highlight])).toEqual([
      ['Processor', 'processor', true],
      ['Physical', 'weight', false],
      ['Looks', null, false],
      [null, 'not_in_template', false],
    ]);
    expect(applyTemplate([{ spec_key: 'CPU', spec_value: 'i5', field_key: 'processor' }], null)[0])
      .toMatchObject({ group_name: null, is_highlight: false });
  });

  test('groupSpecs: template order, then custom groups, then Other', () => {
    const groups = groupSpecs(
      [
        { spec_key: 'Colour', spec_value: 'Black', group_name: 'Looks', field_key: null },
        { spec_key: 'RAM', spec_value: '8 GB', group_name: 'Memory & Storage', field_key: 'ram' },
        { spec_key: 'Note', spec_value: 'Dent', group_name: null, field_key: null },
        { spec_key: 'Processor', spec_value: 'i5', group_name: 'Processor', field_key: 'processor' },
        { spec_key: 'Numpad', spec_value: 'Yes', group_name: 'Processor', field_key: null },
        { spec_key: 'Storage', spec_value: '256 GB', group_name: 'Memory & Storage', field_key: 'storage' },
        { spec_key: 'Generation', spec_value: '8th Gen', group_name: 'Processor', field_key: 'cpu_generation' },
      ],
      tpl
    );
    expect(groups.map((g) => [g.name, g.items.map((i) => i.label)])).toEqual([
      ['Processor', ['Processor', 'Generation', 'Numpad']],
      ['Memory & Storage', ['RAM', 'Storage']],
      ['Looks', ['Colour']],
      ['Other', ['Note']],
    ]);
    expect(groups[0].items[0]).toEqual({ label: 'Processor', value: 'i5', field_key: 'processor' });
    expect(groupSpecs([], tpl)).toEqual([]);
  });
});

describe('GET /categories/:idOrSlug/spec-template', () => {
  test('own template, inherited through two levels, none, and inactive/unknown', async () => {
    const { laptops, used, thinkpads, audio } = await tree();
    await setTemplate(laptops.id, templateSchema.parse(LAPTOP_TEMPLATE));

    const own = (await api.get(`${C}/laptops/spec-template`).expect(200)).body.data;
    expect(own.source_category_id).toBe(laptops.id);
    expect(own.template.groups.map((g) => g.name)).toEqual(['Processor', 'Display', 'Memory & Storage', 'Physical']);

    for (const c of [used, thinkpads]) {
      const res = (await api.get(`${C}/${c.id}/spec-template`).expect(200)).body.data;
      expect(res).toEqual(own);
    }
    expect((await api.get(`${C}/audio/spec-template`).expect(200)).body.data).toEqual({ template: null, source_category_id: null });

    // The nearest ancestor wins.
    const usedTpl = { groups: [{ name: 'Condition', fields: [{ key: 'grade', label: 'Grade', type: 'text', highlight: true }] }] };
    await setTemplate(used.id, usedTpl);
    const near = (await api.get(`${C}/thinkpads/spec-template`).expect(200)).body.data;
    expect(near.source_category_id).toBe(used.id);
    expect(near.template.groups[0].name).toBe('Condition');

    await query('UPDATE categories SET is_active = FALSE WHERE id = $1', [audio.id]);
    await api.get(`${C}/audio/spec-template`).expect(404);
    await api.get(`${C}/nope/spec-template`).expect(404);
    await api.get(`${C}/Bad%20Slug!/spec-template`).expect(400);
  });

  test('a parent cycle in the data cannot hang the walk', async () => {
    const a = await f.category({ slug: 'a' });
    const b = await f.category({ slug: 'b', parent_id: a.id });
    await query('UPDATE categories SET parent_id = $2 WHERE id = $1', [a.id, b.id]); // a ↔ b
    const res = await api.get(`${C}/a/spec-template`).expect(200);
    expect(res.body.data).toEqual({ template: null, source_category_id: null });
    await setTemplate(b.id, { groups: [] });
    expect((await api.get(`${C}/a/spec-template`).expect(200)).body.data.source_category_id).toBe(b.id);
  });
});

describe('GET /categories/admin/:id/spec-template (staff)', () => {
  test('staff only; also answers for hidden categories; ids only', async () => {
    const a = await actors();
    const { laptops, used } = await tree();
    await setTemplate(laptops.id, templateSchema.parse(LAPTOP_TEMPLATE));
    await query('UPDATE categories SET is_active = FALSE WHERE id = $1', [used.id]);
    const url = `${C}/admin/${used.id}/spec-template`;

    await api.get(url).expect(401);
    await api.get(url).set(a.cust).expect(403);
    await api.get(`${C}/${used.id}/spec-template`).expect(404); // public read hides it

    for (const who of [a.ba, a.sa]) {
      const res = (await api.get(url).set(who).expect(200)).body.data;
      expect(res.source_category_id).toBe(laptops.id); // inherited from the parent
      expect(res.template.groups).toHaveLength(4);
    }
    await api.get(`${C}/admin/used-laptops/spec-template`).set(a.ba).expect(400);
    await api.get(`${C}/admin/00000000-0000-4000-8000-000000000000/spec-template`).set(a.ba).expect(404);
  });
});

describe('PUT /categories/:id/spec-template', () => {
  test('authz matrix: anon 401, customer 403, branch_admin and super_admin OK; audited', async () => {
    const a = await actors();
    const { laptops } = await tree();
    const url = `${C}/${laptops.id}/spec-template`;
    await api.put(url).send(LAPTOP_TEMPLATE).expect(401);
    await api.put(url).set(a.cust).send(LAPTOP_TEMPLATE).expect(403);
    const res = await api.put(url).set(a.ba).send(LAPTOP_TEMPLATE).expect(200);
    expect(res.body.data.source_category_id).toBe(laptops.id);
    expect(res.body.data.template.groups[0].fields[0]).toMatchObject({ key: 'processor', highlight: true });
    await api.put(url).set(a.sa).send({ template: LAPTOP_TEMPLATE }).expect(200);

    const log = await auditFor(laptops.id);
    expect(log.map((l) => l.action)).toEqual(['category.spec_template', 'category.spec_template']);
    expect(log[0]).toMatchObject({ actor_id: a.users.ba.id, data: { groups: 4, fields: 7 } });
  });

  test('clearing: { template: null } or an empty body; the child then inherits again', async () => {
    const a = await actors();
    const { laptops, used } = await tree();
    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).send(LAPTOP_TEMPLATE).expect(200);
    await api.put(`${C}/${used.id}/spec-template`).set(a.ba).send({ groups: [] }).expect(200);
    expect((await api.get(`${C}/used-laptops/spec-template`)).body.data.template).toEqual({ groups: [] });

    const cleared = await api.put(`${C}/${used.id}/spec-template`).set(a.ba).send({ template: null }).expect(200);
    expect(cleared.body.data.source_category_id).toBe(laptops.id); // resolved = inherited
    const own = await query('SELECT spec_template FROM categories WHERE id = $1', [used.id]);
    expect(own.rows[0].spec_template).toBeNull();

    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).expect(200); // no body = null
    expect((await api.get(`${C}/laptops/spec-template`)).body.data).toEqual({ template: null, source_category_id: null });
  });

  test('validation: invalid templates, arrays and bad ids → 400; unknown category → 404', async () => {
    const a = await actors();
    const { laptops } = await tree();
    const url = `${C}/${laptops.id}/spec-template`;
    const tooMany = clone(LAPTOP_TEMPLATE);
    tooMany.groups[3].fields[0].highlight = true;
    await api.put(url).set(a.ba).send(tooMany).expect(400);
    await api.put(url).set(a.ba).send([LAPTOP_TEMPLATE]).expect(400);
    await api.put(url).set(a.ba).send({ groups: 'x' }).expect(400);
    await api.put(url).set(a.ba).send({ template: { groups: [{ name: 'G', fields: [{ key: 'A B', label: 'x', type: 'text' }] }] } }).expect(400);
    await api.put(url).set(a.ba).send({ groups: [], sneaky: true }).expect(400);
    await api.put(`${C}/not-a-uuid/spec-template`).set(a.ba).send(LAPTOP_TEMPLATE).expect(400);
    await api.put(`${C}/00000000-0000-4000-8000-000000000000/spec-template`).set(a.ba).send(LAPTOP_TEMPLATE).expect(404);
    // Admin list exposes each category's own template.
    await api.put(url).set(a.ba).send(LAPTOP_TEMPLATE).expect(200);
    const list = (await api.get(`${C}/admin`).set(a.ba).expect(200)).body.data;
    expect(list.find((c) => c.slug === 'laptops').spec_template.groups).toHaveLength(4);
    expect(list.find((c) => c.slug === 'used-laptops').spec_template).toBeNull();
    // The public list does not carry templates.
    expect((await api.get(C).expect(200)).body.data[0]).not.toHaveProperty('spec_template');
  });

  test('changing a template re-syncs group/highlight of inheriting products only', async () => {
    const a = await actors();
    const { laptops, used, audio } = await tree();
    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).send(LAPTOP_TEMPLATE).expect(200);
    const { product } = await f.product({ category_id: used.id });
    const { product: other } = await f.product({ category_id: audio.id });
    await api.put(`${P}/${product.id}/specifications`).set(a.ba).send({
      specifications: [
        { spec_key: 'Processor', spec_value: 'i5-8350U', field_key: 'processor' },
        { spec_key: 'Weight', spec_value: '1.58', field_key: 'weight' },
      ],
    }).expect(200);
    await query("INSERT INTO product_specifications (product_id, spec_key, spec_value, field_key, is_highlight) VALUES ($1, 'Processor', 'x', 'processor', TRUE)", [other.id]);

    // weight becomes a highlight in a renamed group; processor stops being one.
    const next = clone(LAPTOP_TEMPLATE);
    next.groups[0].fields[0].highlight = false;
    next.groups[3] = { name: 'Body', fields: [{ key: 'weight', label: 'Weight', type: 'number', highlight: true }] };
    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).send(next).expect(200);
    expect((await specRows(product.id)).map((r) => [r.field_key, r.group_name, r.is_highlight])).toEqual([
      ['processor', 'Processor', false],
      ['weight', 'Body', true],
    ]);
    // Products outside the subtree are untouched.
    expect((await specRows(other.id))[0].is_highlight).toBe(true);

    // Clearing the only template: no highlights left, groups kept.
    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).send({ template: null }).expect(200);
    expect((await specRows(product.id)).map((r) => [r.group_name, r.is_highlight])).toEqual([
      ['Processor', false], ['Body', false],
    ]);
  });

  test('moving a category under a templated parent re-syncs its products', async () => {
    const a = await actors();
    const { laptops, audio } = await tree();
    await api.put(`${C}/${laptops.id}/spec-template`).set(a.ba).send(LAPTOP_TEMPLATE).expect(200);
    const loose = await f.category({ slug: 'loose' });
    const { product } = await f.product({ category_id: loose.id });
    await api.put(`${P}/${product.id}/specifications`).set(a.ba)
      .send({ specifications: [{ spec_key: 'RAM', spec_value: '8 GB', field_key: 'ram' }] }).expect(200);
    expect((await specRows(product.id))[0]).toMatchObject({ group_name: null, is_highlight: false });

    await api.put(`${C}/${loose.id}`).set(a.ba).send({ parent_id: laptops.id }).expect(200);
    expect((await specRows(product.id))[0]).toMatchObject({ group_name: 'Memory & Storage', is_highlight: true });
    await api.put(`${C}/${loose.id}`).set(a.ba).send({ parent_id: audio.id }).expect(200);
    expect((await specRows(product.id))[0]).toMatchObject({ is_highlight: false });
  });
});

describe('product spec writes fill group_name / is_highlight from the template', () => {
  const setup = async () => {
    const a = await actors();
    const { laptops, used, audio } = await tree();
    await setTemplate(laptops.id, templateSchema.parse(LAPTOP_TEMPLATE));
    return { a, laptops, used, audio };
  };

  test('POST /products nested specifications (template of the target category)', async () => {
    const { a, used } = await setup();
    const res = await api.post(P).set(a.ba).send({
      name: 'ThinkPad T480', category_id: used.id, condition: 'used',
      specifications: [
        { spec_key: 'Processor', spec_value: 'Intel Core i5-8350U', field_key: 'processor', group_name: 'ignored' },
        { spec_key: 'Colour', spec_value: 'Black', group_name: 'Looks' },
        { spec_key: 'RAM', spec_value: '8 GB', field_key: 'ram', sort_order: 10 },
        { spec_key: 'Note', spec_value: 'Tiny scratch' },
      ],
    }).expect(201);
    expect(res.body.data.specifications.map((s) => [s.spec_key, s.group_name, s.field_key, s.is_highlight, s.sort_order])).toEqual([
      ['Processor', 'Processor', 'processor', true, 0],
      ['Colour', 'Looks', null, false, 1],
      ['Note', null, null, false, 3],
      ['RAM', 'Memory & Storage', 'ram', true, 10],
    ]);
  });

  test('POST /products/:id/specifications (add one) and PUT (replace all)', async () => {
    const { a, used } = await setup();
    const { product } = await f.product({ category_id: used.id });
    const url = `${P}/${product.id}/specifications`;

    const one = await api.post(url).set(a.ba).send({ spec_key: 'Display', spec_value: '14"', field_key: 'display_size' }).expect(201);
    expect(one.body.data).toMatchObject({ spec_key: 'Display', group_name: 'Display', field_key: 'display_size', is_highlight: true, sort_order: 0 });
    const custom = await api.post(url).set(a.ba).send({ spec_key: 'Keyboard', spec_value: 'Backlit', group_name: 'Input' }).expect(201);
    expect(custom.body.data).toMatchObject({ group_name: 'Input', field_key: null, is_highlight: false, sort_order: 1 });
    // One value per template field per product.
    await api.post(url).set(a.ba).send({ spec_key: 'Display 2', spec_value: '15"', field_key: 'display_size' }).expect(409);

    const rep = await api.put(url).set(a.ba).send({
      specifications: [
        { spec_key: 'Storage', spec_value: '256 GB', field_key: 'storage' },
        { spec_key: 'Touch', spec_value: 'No', field_key: 'touchscreen' },
        { spec_key: 'Custom', spec_value: 'x', field_key: '' },
      ],
    }).expect(200);
    expect(rep.body.data.map((s) => [s.field_key, s.group_name, s.is_highlight])).toEqual([
      ['storage', 'Memory & Storage', true],
      ['touchscreen', 'Display', false],
      [null, null, false],
    ]);
    expect(rep.body.data[0]).toHaveProperty('id');
  });

  test('validation: bad / duplicate field keys and oversized group names → 400', async () => {
    const { a, used } = await setup();
    const { product } = await f.product({ category_id: used.id });
    const url = `${P}/${product.id}/specifications`;
    await api.post(url).set(a.ba).send({ spec_key: 'X', spec_value: 'y', field_key: 'Bad Key' }).expect(400);
    await api.post(url).set(a.ba).send({ spec_key: 'X', spec_value: 'y', field_key: ['ram'] }).expect(400);
    await api.post(url).set(a.ba).send({ spec_key: 'X', spec_value: 'y', group_name: 'g'.repeat(81) }).expect(400);
    await api.put(url).set(a.ba).send({
      specifications: [
        { spec_key: 'RAM', spec_value: '8', field_key: 'ram' },
        { spec_key: 'RAM 2', spec_value: '16', field_key: 'ram' },
      ],
    }).expect(400);
    await api.post(url).set(a.cust).send({ spec_key: 'X', spec_value: 'y' }).expect(403);
    await api.post(url).send({ spec_key: 'X', spec_value: 'y' }).expect(401);
  });

  test('changing a product category re-applies the new template', async () => {
    const { a, used, audio } = await setup();
    const { product } = await f.product({ category_id: used.id });
    await api.put(`${P}/${product.id}/specifications`).set(a.ba)
      .send({ specifications: [{ spec_key: 'RAM', spec_value: '8 GB', field_key: 'ram' }] }).expect(200);
    expect((await specRows(product.id))[0].is_highlight).toBe(true);

    await setTemplate(audio.id, { groups: [{ name: 'Audio', fields: [{ key: 'ram', label: 'Memory', type: 'text', highlight: false }] }] });
    await api.put(`${P}/${product.id}`).set(a.ba).send({ category_id: audio.id }).expect(200);
    expect((await specRows(product.id))[0]).toMatchObject({ group_name: 'Audio', is_highlight: false });
  });
});

describe('public product reads: spec_groups and highlights', () => {
  const build = async () => {
    const a = await actors();
    const { laptops, used } = await tree();
    await setTemplate(laptops.id, templateSchema.parse(LAPTOP_TEMPLATE));
    const branch = await f.branch();
    const { product } = await f.product({ name: 'ThinkPad T480', category_id: used.id, variants: [{ price: 30000, stock: [{ branch_id: branch.id, quantity: 2 }] }] });
    await api.put(`${P}/${product.id}/specifications`).set(a.ba).send({
      specifications: [
        { spec_key: 'Colour', spec_value: 'Black', group_name: 'Looks' },
        { spec_key: 'Storage', spec_value: '256 GB SSD', field_key: 'storage' },
        { spec_key: 'Processor', spec_value: 'Intel Core i5-8350U', field_key: 'processor' },
        { spec_key: 'Weight', spec_value: '1.58 kg', field_key: 'weight' },
        { spec_key: 'Note', spec_value: 'Tested 48 hours' },
        { spec_key: 'RAM', spec_value: '8 GB', field_key: 'ram' },
        { spec_key: 'Display size', spec_value: '14"', field_key: 'display_size' },
      ],
    }).expect(200);
    return { a, product, used, branch };
  };

  test('detail: spec_groups + highlights added; flat specifications unchanged', async () => {
    const { product } = await build();
    const d = (await api.get(`${P}/${product.slug}`).expect(200)).body.data;

    expect(d.specifications).toEqual([
      { key: 'Colour', value: 'Black' },
      { key: 'Storage', value: '256 GB SSD' },
      { key: 'Processor', value: 'Intel Core i5-8350U' },
      { key: 'Weight', value: '1.58 kg' },
      { key: 'Note', value: 'Tested 48 hours' },
      { key: 'RAM', value: '8 GB' },
      { key: 'Display size', value: '14"' },
    ]);
    expect(d.spec_groups).toEqual([
      { name: 'Processor', items: [{ label: 'Processor', value: 'Intel Core i5-8350U', field_key: 'processor' }] },
      { name: 'Display', items: [{ label: 'Display size', value: '14"', field_key: 'display_size' }] },
      {
        name: 'Memory & Storage',
        items: [
          { label: 'RAM', value: '8 GB', field_key: 'ram' },
          { label: 'Storage', value: '256 GB SSD', field_key: 'storage' },
        ],
      },
      { name: 'Physical', items: [{ label: 'Weight', value: '1.58 kg', field_key: 'weight' }] },
      { name: 'Looks', items: [{ label: 'Colour', value: 'Black', field_key: null }] },
      { name: 'Other', items: [{ label: 'Note', value: 'Tested 48 hours', field_key: null }] },
    ]);
    // Highlights follow the spec order and never exceed 4.
    expect(d.highlights).toEqual([
      { label: 'Storage', value: '256 GB SSD' },
      { label: 'Processor', value: 'Intel Core i5-8350U' },
      { label: 'RAM', value: '8 GB' },
      { label: 'Display size', value: '14"' },
    ]);
  });

  test('legacy products (no template, plain rows) still work', async () => {
    const { product } = await f.product();
    await query("INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES ($1, 'CPU', 'i7')", [product.id]);
    const d = (await api.get(`${P}/${product.slug}`).expect(200)).body.data;
    expect(d.specifications).toEqual([{ key: 'CPU', value: 'i7' }]);
    expect(d.spec_groups).toEqual([{ name: 'Other', items: [{ label: 'CPU', value: 'i7', field_key: null }] }]);
    expect(d.highlights).toEqual([]);
  });

  test('lists, featured and search rows carry highlights (≤4) and category fields', async () => {
    const { product, used } = await build();
    await query('UPDATE products SET is_featured = TRUE WHERE id = $1', [product.id]);
    // A fifth highlight row (written directly) is still capped at 4.
    await query(
      "INSERT INTO product_specifications (product_id, spec_key, spec_value, is_highlight, sort_order) VALUES ($1, 'Extra', 'x', TRUE, 99)",
      [product.id]
    );
    const { product: plain } = await f.product({ name: 'Plain Laptop', category_id: used.id });

    const expected = [
      { label: 'Storage', value: '256 GB SSD' },
      { label: 'Processor', value: 'Intel Core i5-8350U' },
      { label: 'RAM', value: '8 GB' },
      { label: 'Display size', value: '14"' },
    ];
    const list = (await api.get(P).expect(200)).body.data;
    expect(list.find((r) => r.id === product.id).highlights).toEqual(expected);
    expect(list.find((r) => r.id === plain.id).highlights).toEqual([]);
    expect(list.find((r) => r.id === product.id)).toMatchObject({ category: 'Used Laptops', category_slug: 'used-laptops' });

    const featured = (await api.get(`${P}/featured`).expect(200)).body.data;
    expect(featured[0]).toMatchObject({ id: product.id, highlights: expected, category_slug: 'used-laptops' });

    const search = (await api.get(`${P}/search?q=thinkpad`).expect(200)).body.data;
    expect(search[0]).toMatchObject({ id: product.id, highlights: expected, category: 'Used Laptops' });
  });

  test('list highlights come from one batched query, not one per product', async () => {
    const { a, used } = await build();
    for (let i = 0; i < 6; i += 1) {
      const { product } = await f.product({ category_id: used.id });
      await api.post(`${P}/${product.id}/specifications`).set(a.ba)
        .send({ spec_key: 'RAM', spec_value: `${i + 4} GB`, field_key: 'ram' }).expect(201);
    }
    const { pool } = require('../../src/config/database');
    const spy = jest.spyOn(pool, 'query');
    try {
      const res = await api.get(`${P}?limit=50`).expect(200);
      expect(res.body.data).toHaveLength(7);
      expect(res.body.data.every((r) => r.highlights.length >= 1)).toBe(true);
      const specQueries = spy.mock.calls.filter(([sql]) => /product_specifications/.test(String(sql)));
      expect(specQueries).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('admin product reads expose the template link', () => {
  test('GET /products/admin/:id specifications include group_name / field_key / is_highlight', async () => {
    const a = await actors();
    const { laptops, used } = await tree();
    await setTemplate(laptops.id, templateSchema.parse(LAPTOP_TEMPLATE));
    const { product } = await f.product({ category_id: used.id });
    await api.post(`${P}/${product.id}/specifications`).set(a.ba)
      .send({ spec_key: 'RAM', spec_value: '8 GB', field_key: 'ram' }).expect(201);
    const d = (await api.get(`${P}/admin/${product.id}`).set(a.ba).expect(200)).body.data;
    expect(d.specifications).toEqual([
      expect.objectContaining({ spec_key: 'RAM', spec_value: '8 GB', group_name: 'Memory & Storage', field_key: 'ram', is_highlight: true, sort_order: 0 }),
    ]);
  });
});
