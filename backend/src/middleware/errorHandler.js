const ApiError = require('../utils/ApiError');
const config = require('../config');

/**
 * Global error handler middleware.
 * Catches ApiError instances and unexpected errors, returns a consistent JSON response.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
  }

  // Log non-operational (unexpected) errors
  if (!err.isOperational) {
    console.error('❌ Unexpected error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(config.env === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
