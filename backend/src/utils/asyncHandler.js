/**
 * Wraps an async route handler to catch errors and forward to Express error middleware.
 * @param {Function} fn - Async express handler (req, res, next)
 * @returns {Function}
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
