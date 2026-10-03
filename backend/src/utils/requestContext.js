const { AsyncLocalStorage } = require('async_hooks');

/**
 * Per-request context (client IP) available anywhere in the request's async
 * call chain — used by audit() so every admin action records where it came
 * from without each caller having to pass req.ip.
 */
const storage = new AsyncLocalStorage();

const requestContext = (req, res, next) => storage.run({ ip: req.ip }, next);

const currentContext = () => storage.getStore() || {};

module.exports = { requestContext, currentContext };
