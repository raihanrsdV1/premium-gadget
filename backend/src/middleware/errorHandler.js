const config = require('../config');

// Postgres error codes we translate into client errors instead of 500s.
// Messages stay generic: constraint/column names never reach the client.
const PG_ERRORS = {
  '23505': [409, 'A record with the same unique value already exists'],
  '23503': [409, 'This record is referenced by, or references, a missing record'],
  '23514': [409, 'The change violates a data integrity rule'],
  '23502': [400, 'A required field is missing'],
  '22P02': [400, 'Invalid identifier or value format'],
  '22003': [400, 'A numeric value is out of range'],
  '22001': [400, 'A value is too long'],
  '22007': [400, 'Invalid date/time value'],
  '22008': [400, 'Invalid date/time value'],
};

/**
 * Global error handler middleware.
 * Operational errors (ApiError) return their own message. Validation and
 * known Postgres errors map to 4xx with generic messages. Anything else is a
 * 500 with a generic message — details are logged server-side only.
 */
// The database is momentarily unavailable rather than broken: the pool had no
// free connection in time (a traffic burst), or Postgres is restarting or
// unreachable. Answer 503 + Retry-After so clients (the storefront retries
// once) treat it as transient.
const DB_BUSY_CODES = new Set(['57P03', 'ECONNREFUSED', 'ECONNRESET']);
const isDbUnavailable = (err) =>
  err?.message === 'timeout exceeded when trying to connect' || DB_BUSY_CODES.has(err?.code);

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let details;

  if (err.name === 'ZodError') {
    statusCode = 400;
    details = err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
    message = details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ');
  } else if (err.isOperational) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (isDbUnavailable(err)) {
    statusCode = 503;
    message = 'The shop is busy right now. Please try again in a moment.';
    res.set('Retry-After', '2');
    console.warn(`⚠️ Database unavailable (${err.code || err.message}) on ${req.method} ${req.originalUrl}`);
  } else if (err.code && PG_ERRORS[err.code]) {
    [statusCode, message] = PG_ERRORS[err.code];
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body too large';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid file upload';
  }

  // Log only unexpected errors. Operational 5xx (e.g. a deliberate 503 when
  // storage or SMS isn't configured) are expected and would just add noise.
  if (statusCode >= 500 && !err.isOperational && statusCode !== 503) {
    console.error('❌ Unexpected error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details && { errors: details }),
    ...(config.env === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
};

module.exports = errorHandler;
