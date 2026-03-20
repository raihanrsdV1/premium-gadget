const asyncHandler = require('../../utils/asyncHandler');
const paymentService = require('./payment.service');

const initiatePayment = asyncHandler(async (req, res) => {
  const result = await paymentService.initiatePayment(req.body, req.user);
  res.json({ success: true, data: result });
});

/**
 * SSL Commerz IPN (Instant Payment Notification) handler.
 * This is called by SSL Commerz servers — NOT by the user's browser.
 */
const handleIPN = asyncHandler(async (req, res) => {
  await paymentService.processIPN(req.body);
  res.status(200).json({ success: true });
});

const handleSuccess = asyncHandler(async (req, res) => {
  // Redirect user to frontend success page
  const orderId = req.body.value_a; // we'll store order_id in value_a
  res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/order/success?order=${orderId}`);
});

const handleFail = asyncHandler(async (req, res) => {
  const orderId = req.body.value_a;
  res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/order/failed?order=${orderId}`);
});

const handleCancel = asyncHandler(async (req, res) => {
  const orderId = req.body.value_a;
  res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/order/cancelled?order=${orderId}`);
});

const validateTransaction = asyncHandler(async (req, res) => {
  const result = await paymentService.validateTransaction(req.params.transactionId);
  res.json({ success: true, data: result });
});

module.exports = { initiatePayment, handleIPN, handleSuccess, handleFail, handleCancel, validateTransaction };
