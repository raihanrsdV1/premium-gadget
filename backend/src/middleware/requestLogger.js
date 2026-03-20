const morgan = require('morgan');
const config = require('../config');

/**
 * HTTP request logger middleware.
 * Uses 'dev' format in development, 'combined' in production.
 */
const requestLogger = morgan(config.env === 'development' ? 'dev' : 'combined');

module.exports = requestLogger;
