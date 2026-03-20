const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');

/**
 * Payment service — SSL Commerz integration.
 * TODO: Implement full SSL Commerz flow in Phase 3+.
 */

const initiatePayment = async (data, user) => {
  // TODO: 1. Create transaction record
  // TODO: 2. Call SSL Commerz init API
  // TODO: 3. Return gateway URL for redirect
  throw ApiError.internal('SSL Commerz payment initiation not implemented yet');
};

/**
 * Process IPN callback from SSL Commerz.
 * Verifies store credentials, updates transaction and order status.
 */
const processIPN = async (payload) => {
  // TODO: 1. Verify val_id with SSL Commerz validation API
  // TODO: 2. Update transactions table with full IPN payload
  // TODO: 3. Update order status based on payment result
  console.log('📨 IPN received:', JSON.stringify(payload).substring(0, 200));
};

const validateTransaction = async (transactionId) => {
  // TODO: Call SSL Commerz validation API and return result
  throw ApiError.internal('Transaction validation not implemented yet');
};

module.exports = { initiatePayment, processIPN, validateTransaction };
