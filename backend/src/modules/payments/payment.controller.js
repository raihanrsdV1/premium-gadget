const asyncHandler = require('../../utils/asyncHandler');
const config = require('../../config');
const paymentService = require('./payment.service');

const STOREFRONT = config.urls.storefront;

const initiatePayment = asyncHandler(async (req, res) => {
  const result = await paymentService.initiatePayment(req.body, req.user);
  res.json({ success: true, data: result });
});

/**
 * SSL Commerz IPN — called by SSL Commerz servers, not the user's browser.
 */
const handleIPN = asyncHandler(async (req, res) => {
  await paymentService.processIPN(req.body);
  res.status(200).json({ success: true });
});

/**
 * Success callback (browser POST-redirect). Validates server-side, confirms the
 * order, then redirects the user to the storefront confirmation page. On any
 * validation failure the reservation is released and the user is sent to a
 * failure page.
 */
const handleSuccess = asyncHandler(async (req, res) => {
  try {
    const result = await paymentService.handleSuccess(req.body);
    return res.redirect(`${STOREFRONT}/order-success?ref=${encodeURIComponent(result.order_number)}`);
  } catch (err) {
    return res.redirect(`${STOREFRONT}/checkout?payment=failed`);
  }
});

const handleFail = asyncHandler(async (req, res) => {
  await paymentService.handleFailure(req.body, 'failed');
  res.redirect(`${STOREFRONT}/checkout?payment=failed`);
});

const handleCancel = asyncHandler(async (req, res) => {
  await paymentService.handleFailure(req.body, 'cancelled');
  res.redirect(`${STOREFRONT}/checkout?payment=cancelled`);
});

const validateTransaction = asyncHandler(async (req, res) => {
  const result = await paymentService.validateTransaction(req.params.transactionId);
  res.json({ success: true, data: result });
});

module.exports = { initiatePayment, handleIPN, handleSuccess, handleFail, handleCancel, validateTransaction };
