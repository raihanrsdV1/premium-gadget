/**
 * SSLCommerz client unit tests. global.fetch is stubbed: no network.
 * Covers SEC-02 (val_id injection) and BE-02 (network errors must surface as
 * GatewayUnavailableError, never as an "invalid payment" answer).
 */
const config = require('../../src/config');
const client = require('../../src/modules/payments/sslcommerz.client');
const { GatewayUnavailableError, isGatewayUnavailable } = require('../../src/modules/payments/gateway.shared');

const realFetch = global.fetch;
let calls;

const respond = (body, { status = 200, raw = false } = {}) => {
  global.fetch = jest.fn(async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return new Response(raw ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
};

beforeEach(() => {
  calls = [];
  config.sslcommerz.isSandbox = true;
});
afterAll(() => {
  global.fetch = realFetch;
  config.sslcommerz.isSandbox = true;
});

describe('validatePayment', () => {
  test('builds the query with URLSearchParams against the sandbox validator', async () => {
    respond({ status: 'VALID', tran_id: 'PG-20261003-001001', APIConnect: 'DONE' });
    const res = await client.validatePayment('2510031234abcXYZ_-9');
    expect(res.status).toBe('VALID');
    const { url, init } = calls[0];
    expect(url.origin).toBe('https://sandbox.sslcommerz.com');
    expect(url.pathname).toBe('/validator/api/validationserverAPI.php');
    expect(url.searchParams.get('val_id')).toBe('2510031234abcXYZ_-9');
    expect(url.searchParams.get('store_id')).toBe('teststore');
    expect(url.searchParams.get('store_passwd')).toBe('teststorepass');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.getAll('store_id')).toHaveLength(1);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('live mode uses securepay.sslcommerz.com', async () => {
    config.sslcommerz.isSandbox = false;
    respond({ status: 'VALID', APIConnect: 'DONE' });
    await client.validatePayment('abc');
    expect(calls[0].url.origin).toBe('https://securepay.sslcommerz.com');
  });

  test.each([
    ['x&store_id=evil&store_passwd=evil#'],
    ['abc#frag'],
    ['abc&v=2'],
    ['a b'],
    ['a/../b'],
    [''],
    ['x'.repeat(101)],
  ])('SEC-02: refuses %j before any network call', async (bad) => {
    respond({ status: 'VALID' });
    await expect(client.validatePayment(bad)).rejects.toMatchObject({ code: 'INVALID_GATEWAY_ID' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('SEC-02: non-string ids are refused', async () => {
    respond({ status: 'VALID' });
    await expect(client.validatePayment(['a', 'b'])).rejects.toMatchObject({ code: 'INVALID_GATEWAY_ID' });
    await expect(client.validatePayment({ toString: () => 'abc' })).rejects.toMatchObject({ code: 'INVALID_GATEWAY_ID' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('BE-02: a network error is GatewayUnavailableError', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });
    const err = await client.validatePayment('abc').catch((e) => e);
    expect(err).toBeInstanceOf(GatewayUnavailableError);
    expect(isGatewayUnavailable(err)).toBe(true);
  });

  test('BE-02: a timeout is GatewayUnavailableError', async () => {
    global.fetch = jest.fn(async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });
    await expect(client.validatePayment('abc')).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE', message: expect.stringMatching(/timed out/) });
  });

  test('uses a 10s abort timeout', () => {
    expect(client.TIMEOUT_MS).toBe(10000);
  });

  test('BE-02: non-2xx is GatewayUnavailableError', async () => {
    respond({ status: 'VALID' }, { status: 502 });
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  test('BE-02: invalid JSON / non-object JSON is GatewayUnavailableError', async () => {
    respond('<html>maintenance</html>', { raw: true });
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
    respond([1, 2]);
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
    respond('null', { raw: true });
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  test('refused store credentials are "unavailable", not "invalid payment"', async () => {
    respond({ APIConnect: 'FAILED' });
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
    respond({ APIConnect: 'INACTIVE' });
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  test('an INVALID_TRANSACTION answer (APIConnect DONE) is returned as data', async () => {
    respond({ status: 'INVALID_TRANSACTION', APIConnect: 'DONE' });
    await expect(client.validatePayment('abc')).resolves.toEqual({ status: 'INVALID_TRANSACTION', APIConnect: 'DONE' });
  });

  test.each([
    [{ status: 'VALID', tran_id: 'PG-1' }],
    [{ status: 'VALID', APIConnect: 'INVALID_REQUEST' }],
    [{ status: 'VALID', APIConnect: '' }],
    [{ status: 'INVALID_TRANSACTION' }],
  ])('L4: an answer without APIConnect DONE is unavailable, never a verdict: %j', async (body) => {
    respond(body);
    await expect(client.validatePayment('abc')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});

describe('queryByTranId', () => {
  test('queries the merchant tran-id API and returns elements', async () => {
    respond({ APIConnect: 'DONE', no_of_trans_found: 2, element: [{ status: 'FAILED' }, { status: 'VALID', val_id: 'v1' }] });
    const res = await client.queryByTranId('PG-20261003-001001');
    expect(res.elements).toEqual([{ status: 'FAILED' }, { status: 'VALID', val_id: 'v1' }]);
    const { url } = calls[0];
    expect(url.pathname).toBe('/validator/api/merchantTransIDvalidationAPI.php');
    expect(url.searchParams.get('tran_id')).toBe('PG-20261003-001001');
    expect(url.searchParams.get('store_id')).toBe('teststore');
  });

  test('"no attempts" only when the gateway explicitly says so', async () => {
    respond({ APIConnect: 'DONE', no_of_trans_found: 0 });
    await expect(client.queryByTranId('PG-1')).resolves.toMatchObject({ elements: [] });
    respond({ APIConnect: 'DONE', no_of_trans_found: '0' });
    await expect(client.queryByTranId('PG-1')).resolves.toMatchObject({ elements: [] });
    respond({ APIConnect: 'DONE', no_of_trans_found: 0, element: [] });
    await expect(client.queryByTranId('PG-1')).resolves.toMatchObject({ elements: [] });
  });

  test.each([
    [{ APIConnect: 'DONE' }],
    [{ APIConnect: 'DONE', no_of_trans_found: 1 }],
    [{ APIConnect: 'DONE', element: 'none' }],
    [{ APIConnect: 'DONE', element: [{ status: 'FAILED' }, 'junk'] }],
    [{ no_of_trans_found: 0 }],
    [{ APIConnect: 'INVALID_REQUEST', no_of_trans_found: 0 }],
    [{ APIConnect: 'FAILED' }],
  ])('L4: unexpected query answer %j is unavailable, never "no attempts"', async (body) => {
    respond(body);
    await expect(client.queryByTranId('PG-1')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  test('refuses injected tran_id; network failure is unavailable', async () => {
    respond({});
    await expect(client.queryByTranId('PG-1&store_id=x')).rejects.toMatchObject({ code: 'INVALID_GATEWAY_ID' });
    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(client.queryByTranId('PG-1')).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});

describe('createSession', () => {
  const order = { id: '6f1c1a3e-6b0e-4b8e-9d5e-1a2b3c4d5e6f', order_number: 'PG-20261003-001001', total_amount: '50100.00' };

  test('posts form-encoded tran_id = order_number, value_a = order id', async () => {
    respond({ status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcde', sessionkey: 'K' });
    const res = await client.createSession(order, { name: 'Rahim "R" Uddin', productSummary: 'MacBook Pro 14"' });
    expect(res).toEqual({ gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcde', sessionKey: 'K' });
    const { url, init } = calls[0];
    expect(url.href).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body.toString());
    expect(body.get('tran_id')).toBe(order.order_number);
    expect(body.get('value_a')).toBe(order.id);
    expect(body.get('total_amount')).toBe('50100.00');
    expect(body.get('currency')).toBe('BDT');
    expect(body.get('success_url')).toBe('http://localhost:5001/api/v1/payments/success');
    expect(body.get('ipn_url')).toBe('http://localhost:5001/api/v1/payments/ipn');
    expect(body.get('cus_name')).toBe('Rahim R Uddin');
    expect(body.get('product_name')).toBe('MacBook Pro 14');
  });

  test('init failure or a non-gateway redirect URL is GatewayUnavailableError', async () => {
    respond({ status: 'FAILED', failedreason: 'Store Credential Error' });
    await expect(client.createSession(order)).rejects.toBeInstanceOf(GatewayUnavailableError);
    respond({ status: 'SUCCESS', GatewayPageURL: 'https://evil.example/pay' });
    await expect(client.createSession(order)).rejects.toBeInstanceOf(GatewayUnavailableError);
    respond({ status: 'SUCCESS', GatewayPageURL: 'http://sandbox.sslcommerz.com/x' });
    await expect(client.createSession(order)).rejects.toBeInstanceOf(GatewayUnavailableError);
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(client.createSession(order)).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});
