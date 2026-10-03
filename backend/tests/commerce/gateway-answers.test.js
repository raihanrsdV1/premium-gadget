/**
 * L4 end to end: the REAL SSLCommerz client (global.fetch stubbed) must treat
 * unexpected gateway answers as "unavailable", so they can never confirm a
 * payment or be read as "no attempts" and cancel an order.
 */
const { factories: f } = require('../helpers');
const h = require('./_helpers');
const expiry = require('../../src/jobs/reservationExpiry');

const STORE = 'http://localhost:3000';
const realFetch = global.fetch;
let answers;

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn(async (url) => {
    const path = new URL(String(url)).pathname;
    const body = path.includes('/gwprocess/') ? answers.init
      : path.includes('validationserverAPI') ? answers.validation
        : answers.query;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});
afterAll(() => { global.fetch = realFetch; });

beforeEach(async () => {
  await h.reset();
  answers = {
    init: { status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testx', sessionkey: 'K' },
    validation: { APIConnect: 'DONE', status: 'INVALID_TRANSACTION' },
    query: { APIConnect: 'DONE', no_of_trans_found: 0 },
  };
});

const placed = async () => {
  const { variant, branch } = await h.shop();
  const order = await h.placeOrder((await f.user()).token, variant);
  expect(order.redirect_url).toBe('https://sandbox.sslcommerz.com/EasyCheckOut/testx');
  return { order, variant, branch };
};

test.each([
  [{ APIConnect: 'DONE' }],
  [{ APIConnect: 'DONE', no_of_trans_found: 2 }],
  [{ APIConnect: 'DONE', element: 'oops' }],
  [{ APIConnect: 'INVALID_REQUEST', no_of_trans_found: 0 }],
  [{ no_of_trans_found: 0, element: [] }],
])('expiry keeps the reservation when the query answer is %j', async (answer) => {
  const { order, variant, branch } = await placed();
  answers.query = answer;
  await h.age(order.order_id, 91);
  expect(await expiry.run()).toMatchObject({ checked: 1, released: 0, skipped: 1 });
  expect((await h.orderRow(order.order_id)).status).toBe('pending');
  expect(await h.stock(variant.id, branch.id)).toMatchObject({ reserved: 1 });

  // an explicit "no transactions" answer does release it
  answers.query = { APIConnect: 'DONE', no_of_trans_found: 0 };
  expect(await expiry.run()).toMatchObject({ released: 1 });
});

test('a forged fail callback with a malformed gateway answer releases nothing', async () => {
  const { order } = await placed();
  answers.query = { APIConnect: 'DONE', element: [{ status: 'CANCELLED' }, null] };
  const res = await h.fail({ tran_id: order.order_number }).expect(303);
  expect(res.headers.location).toBe(`${STORE}/checkout?payment=failed&ref=${order.order_number}`);
  expect((await h.orderRow(order.order_id)).status).toBe('pending');
});

test('a "VALID" validation answer without APIConnect DONE confirms nothing', async () => {
  const { order } = await placed();
  const payment = {
    status: 'VALID', val_id: 'VAL1', tran_id: order.order_number, value_a: order.order_id,
    amount: order.total.toFixed(2), currency_amount: order.total.toFixed(2), currency: 'BDT', currency_type: 'BDT', risk_level: '0',
  };
  answers.validation = payment;
  const res = await h.success({ val_id: 'VAL1', tran_id: order.order_number }).expect(303);
  expect(res.headers.location).toBe(`${STORE}/checkout?payment=pending&ref=${order.order_number}`);
  expect(await h.orderRow(order.order_id)).toMatchObject({ status: 'pending', payment_status: 'pending' });
  expect(await h.txRows(order.order_id)).toHaveLength(0);

  // the same answer with APIConnect DONE is accepted
  answers.validation = { ...payment, APIConnect: 'DONE' };
  const ok = await h.success({ val_id: 'VAL1', tran_id: order.order_number }).expect(303);
  expect(ok.headers.location).toBe(`${STORE}/order-success?ref=${order.order_number}`);
});
