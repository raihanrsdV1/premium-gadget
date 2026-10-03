const express = require('express');
const request = require('supertest');
const errorHandler = require('../src/middleware/errorHandler');

// A tiny app: each route fails the way pg / pg-pool do when the database is
// momentarily unavailable, or with an ordinary bug for contrast.
const app = express();
const fail = (err) => (req, res, next) => next(err);
const coded = (code, message = 'boom') => Object.assign(new Error(message), { code });
app.get('/pool-timeout', fail(new Error('timeout exceeded when trying to connect')));
app.get('/starting-up', fail(coded('57P03', 'the database system is starting up')));
app.get('/refused', fail(coded('ECONNREFUSED')));
app.get('/bug', fail(new TypeError('x is not a function')));
app.use(errorHandler);

describe('database unavailable → 503 + Retry-After (transient), not 500', () => {
  let warn;
  let error;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { warn.mockRestore(); error.mockRestore(); });

  test.each(['/pool-timeout', '/starting-up', '/refused'])('%s', async (path) => {
    const res = await request(app).get(path).expect(503);
    expect(res.headers['retry-after']).toBe('2');
    expect(res.body).toMatchObject({ success: false, message: expect.stringMatching(/busy/) });
    expect(JSON.stringify(res.body)).not.toMatch(/timeout exceeded|ECONNREFUSED|starting up/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  test('an ordinary bug is still a logged 500', async () => {
    const res = await request(app).get('/bug').expect(500);
    expect(res.headers['retry-after']).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
