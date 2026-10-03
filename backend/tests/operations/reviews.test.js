const { api, query, resetDb, factories: f } = require('../helpers');
const { world, auditCount } = require('./ops.helpers');

const RV = '/api/v1/reviews';
let w;
let product;
let variant;

beforeEach(async () => {
  await resetDb();
  w = await world();
  ({ product, variants: [variant] } = await f.product({ name: 'MacBook Air M2' }));
});

const as = (who) => f.auth(who.token);
const write = (who, body = {}) =>
  api.post(RV).set(as(who)).send({ product_id: product.id, rating: 5, title: 'Great', body: 'Battery lasts all day', ...body });

/** An order of `status` for `user` containing the product's variant. */
const order = async (userId, status) => {
  const { rows: [o] } = await query(
    `INSERT INTO orders (order_number, user_id, channel, status, subtotal, total_amount)
     VALUES ($1, $2, 'online', $3, 100, 100) RETURNING id`,
    [`PG-T-${Math.random().toString(36).slice(2, 10)}`, userId, status]
  );
  await query(
    'INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES ($1, $2, 1, 100, 100)',
    [o.id, variant.id]
  );
};

describe('POST /reviews', () => {
  test('requires login; stored unapproved; is_approved in the body is ignored', async () => {
    await api.post(RV).send({ product_id: product.id, rating: 5 }).expect(401);
    const res = await write(w.customer, { is_approved: true, verified_purchase: true, user_id: w.sa.user.id }).expect(201);
    expect(res.body.data).toMatchObject({ is_approved: false, verified_purchase: false, rating: 5 });
    const row = (await query('SELECT user_id FROM reviews')).rows[0];
    expect(row.user_id).toBe(w.customer.user.id);
  });

  test('validation', async () => {
    const bad = [{ rating: 6 }, { rating: 0 }, { rating: 4.5 }, { rating: '5' }, { title: 'x'.repeat(201) },
      { body: 'x'.repeat(2001) }, { product_id: 'nope' }, { rating: [5] }];
    for (const body of bad) await write(w.customer, body).expect(400);
  });

  test('inactive or deleted products cannot be reviewed', async () => {
    await query('UPDATE products SET is_active = FALSE WHERE id = $1', [product.id]);
    await write(w.customer).expect(404);
    await query('UPDATE products SET is_active = TRUE, deleted_at = NOW() WHERE id = $1', [product.id]);
    await write(w.customer).expect(404);
  });

  test('one review per user per product, including under concurrency', async () => {
    await write(w.customer).expect(201);
    const dup = await write(w.customer, { rating: 1 }).expect(409);
    expect(dup.body.message).toMatch(/already reviewed/);

    const other = await f.user();
    const [r1, r2] = await Promise.all([write(other), write(other)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
  });

  test('verified_purchase: only for orders that were actually bought', async () => {
    const buyer = await f.user();
    await order(buyer.user.id, 'delivered');
    expect((await write(buyer).expect(201)).body.data.verified_purchase).toBe(true);

    const pending = await f.user();
    await order(pending.user.id, 'pending');
    await order(pending.user.id, 'cancelled');
    expect((await write(pending).expect(201)).body.data.verified_purchase).toBe(false);
  });
});

describe('GET /reviews (public)', () => {
  test('approved only, first names, summary; product_id required', async () => {
    const a = await f.user({ full_name: 'Tanvir Ahmed Chowdhury' });
    const b = await f.user({ full_name: 'Nusrat Jahan' });
    const c = await f.user({ full_name: 'Pending Person' });
    await order(a.user.id, 'delivered');
    const ra = (await write(a, { rating: 5 })).body.data;
    const rb = (await write(b, { rating: 3 })).body.data;
    await write(c, { rating: 1 });
    await query('UPDATE reviews SET is_approved = TRUE WHERE id = ANY($1::uuid[])', [[ra.id, rb.id]]);

    const res = await api.get(`${RV}?product_id=${product.id}`).expect(200);
    expect(res.body.data.map((r) => r.reviewer_name).sort()).toEqual(['Nusrat', 'Tanvir']);
    expect(res.body.data.find((r) => r.reviewer_name === 'Tanvir').verified_purchase).toBe(true);
    expect(res.body.summary).toEqual({ average: 4, count: 2, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } });
    expect(JSON.stringify(res.body)).not.toMatch(/user_id|phone|Chowdhury|Pending/);
    expect(res.body.pagination.total).toBe(2);

    await api.get(RV).expect(400);
    await api.get(`${RV}?product_id=nope`).expect(400);
    await api.get(`${RV}?product_id=${product.id}&product_id=${product.id}`).expect(400);
    await api.get(`${RV}?product_id=00000000-0000-4000-8000-000000000000`).expect(404);
  });

  test('empty summary for a product without approved reviews', async () => {
    const res = await api.get(`${RV}?product_id=${product.id}`).expect(200);
    expect(res.body.summary).toEqual({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});

describe('edit / delete', () => {
  test('owner edit resets approval; others → 403', async () => {
    const r = (await write(w.customer)).body.data;
    await api.patch(`${RV}/${r.id}/moderation`).set(as(w.adminA)).send({ is_approved: true }).expect(200);
    const other = await f.user();
    await api.put(`${RV}/${r.id}`).set(as(other)).send({ rating: 1 }).expect(403);
    await api.put(`${RV}/${r.id}`).set(as(w.sa)).send({ rating: 1 }).expect(403);
    await api.put(`${RV}/${r.id}`).set(as(w.customer)).send({}).expect(400);
    const res = await api.put(`${RV}/${r.id}`).set(as(w.customer)).send({ rating: 4, title: null }).expect(200);
    expect(res.body.data).toMatchObject({ rating: 4, title: null, body: 'Battery lasts all day', is_approved: false });
    const row = (await query('SELECT moderated_by FROM reviews WHERE id = $1', [r.id])).rows[0];
    expect(row.moderated_by).toBeNull();
  });

  test('delete: owner or super_admin only (audited); branch_admin and other customers refused', async () => {
    const r1 = (await write(w.customer)).body.data;
    const other = await f.user();
    await api.delete(`${RV}/${r1.id}`).set(as(other)).expect(403);
    await api.delete(`${RV}/${r1.id}`).set(as(w.adminA)).expect(403);
    await api.delete(`${RV}/${r1.id}`).set(as(w.customer)).expect(200);
    await api.delete(`${RV}/${r1.id}`).set(as(w.customer)).expect(404);

    const r2 = (await write(other)).body.data;
    await api.delete(`${RV}/${r2.id}`).set(as(w.sa)).expect(200);
    expect(await auditCount('review.delete', r2.id)).toBe(1);
  });

  test('GET /reviews/mine lists the caller’s reviews in any state', async () => {
    await write(w.customer);
    const res = await api.get(`${RV}/mine?product_id=${product.id}`).set(as(w.customer)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ is_approved: false, product_name: 'MacBook Air M2' });
    expect((await api.get(`${RV}/mine`).set(as(w.adminA))).body.data).toHaveLength(0);
  });
});

describe('moderation (staff)', () => {
  test('queue with reviewer phone; approve sets moderator; customers blocked', async () => {
    const r = (await write(w.customer)).body.data;
    await api.get(`${RV}/admin`).expect(401);
    await api.get(`${RV}/admin`).set(as(w.customer)).expect(403);
    await api.patch(`${RV}/${r.id}/moderation`).set(as(w.customer)).send({ is_approved: true }).expect(403);

    const queue = await api.get(`${RV}/admin`).set(as(w.adminA)).expect(200);
    expect(queue.body.data[0]).toMatchObject({ id: r.id, reviewer_phone: w.customer.user.phone, reviewer_name: 'Karim Uddin' });

    await api.patch(`${RV}/${r.id}/moderation`).set(as(w.adminA)).send({ is_approved: 'yes' }).expect(400);
    const mod = await api.patch(`${RV}/${r.id}/moderation`).set(as(w.adminA)).send({ is_approved: true }).expect(200);
    expect(mod.body.data).toMatchObject({ is_approved: true, moderated_by: w.adminA.user.id });
    expect(mod.body.data.moderated_at).not.toBeNull();
    expect(await auditCount('review.moderate', r.id)).toBe(1);

    expect((await api.get(`${RV}/admin`).set(as(w.adminA))).body.data).toHaveLength(0); // default: pending
    expect((await api.get(`${RV}/admin?status=approved`).set(as(w.adminA))).body.data).toHaveLength(1);
    expect((await api.get(`${RV}/admin?status=all&q=karim`).set(as(w.adminA))).body.data).toHaveLength(1);
    await api.get(`${RV}/admin?status=spam`).set(as(w.adminA)).expect(400);
    expect((await api.get(`${RV}?product_id=${product.id}`)).body.data).toHaveLength(1);

    await api.patch(`${RV}/00000000-0000-4000-8000-000000000000/moderation`).set(as(w.adminA)).send({ is_approved: true }).expect(404);
  });
});
