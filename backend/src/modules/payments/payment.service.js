const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const sslcommerz = require('./sslcommerz.client');
const orderService = require('../orders/order.service');

const VALID_STATUSES = new Set(['VALID', 'VALIDATED']);

/**
 * STEP 1 — Phase B (success callback). Validates the payment server-side with
 * SSLCommerz (never trusting the redirect alone), then confirms the order.
 * Returns { order_number, status } or throws on validation failure (after
 * releasing the reservation).
 */
const handleSuccess = async (body) => {
  const orderId = body.value_a;
  if (!orderId) throw ApiError.badRequest('Missing order reference (value_a)');

  const oRes = await query(
    'SELECT id, order_number, total_amount, status FROM orders WHERE id = $1',
    [orderId]
  );
  const order = oRes.rows[0];
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status === 'confirmed') {
    return { order_number: order.order_number, status: 'confirmed' };
  }

  let validation = {};
  try {
    validation = await sslcommerz.validatePayment(body.val_id);
  } catch (err) {
    validation = { status: 'INVALID', error: err.message };
  }

  const statusOk = VALID_STATUSES.has(String(validation.status).toUpperCase());
  const amountOk = Number(validation.amount) === Number(order.total_amount);
  if (!statusOk || !amountOk) {
    await orderService.releaseOrder(orderId, 'failed');
    throw ApiError.badRequest('Payment validation failed');
  }

  const confirmed = await orderService.confirmOrderPaid(orderId, validation, body);
  return { order_number: confirmed.order_number, status: 'confirmed' };
};

/**
 * STEP 1 — Phase B (fail/cancel callback). Releases the reservation and
 * cancels the order.
 */
const handleFailure = async (body, reason = 'cancelled') => {
  const orderId = body.value_a;
  if (!orderId) return { status: reason };
  const released = await orderService.releaseOrder(orderId, reason);
  return { order_number: released.order_number, status: 'cancelled' };
};

/**
 * IPN webhook (server-to-server). Mirrors success validation; idempotent.
 * In local dev the sandbox cannot reach localhost, so confirmation is driven
 * by the success callback instead.
 */
const processIPN = async (body) => {
  if (body.val_id || String(body.status).toUpperCase() === 'VALID') {
    try {
      await handleSuccess(body);
    } catch (err) {
      console.error('📨 IPN handling error:', err.message);
    }
  }
};

// Legacy endpoints kept for route compatibility (the new flow creates the
// session in order.service.create / Phase A, so these are unused).
const initiatePayment = async () => {
  throw ApiError.internal('Use POST /orders/checkout to start an online order');
};
const validateTransaction = async () => {
  throw ApiError.internal('Not implemented');
};

module.exports = {
  handleSuccess,
  handleFailure,
  processIPN,
  initiatePayment,
  validateTransaction,
};
