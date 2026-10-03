const config = require('../config');

/**
 * SMS delivery. No gateway is integrated yet (BD options: SSL Wireless,
 * BulkSMSBD, Alpha SMS — pick one and add a driver here).
 *
 * Until then:
 *   - development/test: the message is logged so OTP flows can be exercised
 *   - production: isConfigured() is false and callers must refuse OTP flows
 *     rather than pretend a code was sent
 */
const isConfigured = () => Boolean(config.sms.apiKey) || !config.isProd;

const send = async (phone, message) => {
  if (!config.sms.apiKey) {
    if (config.isProd) throw new Error('SMS gateway is not configured');
    if (!config.isTest) console.log(`📱 [dev SMS] to ${phone}: ${message}`);
    return { delivered: false, driver: 'console' };
  }
  // TODO: integrate the chosen BD SMS gateway (HTTP API call with config.sms.apiKey / senderId).
  throw new Error('SMS gateway driver not implemented');
};

module.exports = { send, isConfigured };
