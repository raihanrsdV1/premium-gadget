const morgan = require('morgan');
const config = require('../config');

// Never write phone numbers / codes / tokens from query strings to the logs.
const SENSITIVE_PARAMS = /([?&](?:phone|code|token|val_id|password)=)[^&]*/gi;
morgan.token('safe-url', (req) => (req.originalUrl || req.url).replace(SENSITIVE_PARAMS, '$1[redacted]'));

const FORMAT = config.env === 'development'
  ? ':method :safe-url :status :response-time ms - :res[content-length]'
  : ':remote-addr - [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

/**
 * HTTP request logger middleware (silent in tests).
 */
const requestLogger = morgan(FORMAT, { skip: () => config.isTest });

module.exports = requestLogger;
