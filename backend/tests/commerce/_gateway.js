/**
 * In-memory SSLCommerz stand-in for commerce tests.
 *
 *   jest.mock('../../src/modules/payments/sslcommerz.client', () => require('./_gateway').mockClient());
 *   const gw = require('./_gateway');
 *   const p = gw.pay(order);           // customer pays on the hosted page
 *   gw.state.down = true;              // gateway outage
 *
 * Mimics the real gateway's behaviour that matters for security: the first
 * validation of a val_id answers VALID, later ones VALIDATED; transaction
 * queries list every attempt for a tran_id.
 */
const { GatewayUnavailableError } = require('../../src/modules/payments/gateway.shared');

const state = {
  payments: new Map(), // val_id → gateway payment record
  attempts: new Map(), // tran_id → [{ status, val_id? , ... }]
  down: false, // validate + query fail
  sessionDown: false, // createSession fails
  seq: 0,
};

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

const view = (p) => strip({ ...p, status: p._validated ? 'VALIDATED' : p.status });

const attemptsFor = (tranId) => {
  if (!state.attempts.has(tranId)) state.attempts.set(tranId, []);
  return state.attempts.get(tranId);
};

const client = {
  createSession: jest.fn(async (order) => {
    if (state.sessionDown) throw new GatewayUnavailableError('SSLCommerz request failed');
    attemptsFor(order.order_number).push({
      status: 'PENDING', tran_id: order.order_number, value_a: order.id, amount: Number(order.total_amount).toFixed(2),
    });
    return { gatewayUrl: `https://sandbox.sslcommerz.com/EasyCheckOut/test${order.order_number}`, sessionKey: 'SESSION' };
  }),

  validatePayment: jest.fn(async (valId) => {
    if (state.down) throw new GatewayUnavailableError('SSLCommerz request timed out');
    const p = state.payments.get(valId);
    if (!p) return { status: 'INVALID_TRANSACTION', APIConnect: 'DONE' };
    const answer = view(p);
    if (p.status === 'VALID') p._validated = true;
    return answer;
  }),

  queryByTranId: jest.fn(async (tranId) => {
    if (state.down) throw new GatewayUnavailableError('SSLCommerz request timed out');
    const elements = attemptsFor(tranId).map((a) => (a.val_id && state.payments.get(a.val_id) ? view(state.payments.get(a.val_id)) : { ...a }));
    return { elements, raw: { APIConnect: 'DONE', no_of_trans_found: elements.length, element: elements } };
  }),
};

/**
 * The customer pays for an order on the gateway. `order` needs
 * { order_number, order_id|id, total|total_amount }. Overrides let a test
 * forge mismatching gateway records (amount, currency, value_a, risk_level).
 */
const pay = (order, overrides = {}) => {
  state.seq += 1;
  const amount = Number(order.total ?? order.total_amount).toFixed(2);
  const record = {
    status: 'VALID',
    val_id: `VAL${Date.now().toString(36)}${state.seq}`,
    tran_id: order.order_number,
    value_a: order.order_id || order.id,
    amount,
    store_amount: (Number(amount) * 0.975).toFixed(2),
    currency: 'BDT',
    currency_type: 'BDT',
    currency_amount: amount,
    card_type: 'BKASH-BKash',
    card_no: '',
    bank_tran_id: `BT${state.seq}`,
    tran_date: '2026-10-03 12:00:00',
    risk_level: '0',
    risk_title: 'Safe',
    APIConnect: 'DONE',
    ...overrides,
  };
  state.payments.set(record.val_id, record);
  const list = attemptsFor(record.tran_id);
  const open = list.find((a) => a.status === 'PENDING' && !a.val_id);
  if (open) Object.assign(open, { val_id: record.val_id });
  else list.push({ val_id: record.val_id });
  return { ...record };
};

/** The customer's open attempt ends without payment (FAILED / CANCELLED). */
const endAttempt = (orderNumber, status) => {
  const list = attemptsFor(orderNumber);
  const open = list.find((a) => a.status === 'PENDING' && !a.val_id);
  if (open) open.status = status;
  else list.push({ status, tran_id: orderNumber });
};

const reset = () => {
  state.payments.clear();
  state.attempts.clear();
  state.down = false;
  state.sessionDown = false;
  for (const fn of Object.values(client)) fn.mockClear();
};

/** jest.mock factory: the real module with the network functions swapped. */
const mockClient = () => ({
  ...jest.requireActual('../../src/modules/payments/sslcommerz.client'),
  createSession: (...a) => client.createSession(...a),
  validatePayment: (...a) => client.validatePayment(...a),
  queryByTranId: (...a) => client.queryByTranId(...a),
});

module.exports = { state, client, pay, endAttempt, reset, mockClient };
