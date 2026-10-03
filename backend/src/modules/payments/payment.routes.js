const { Router } = require('express');
const config = require('../../config');
const controller = require('./payment.controller');
const {
  successCallbackSchema, returnCallbackSchema, ipnSchema, retryParams, reconcileParams,
} = require('./payment.validation');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../auth/auth.middleware');
const { commerceLimiters } = require('../../middleware/rateLimiter');

const router = Router();

/**
 * Browser-facing gateway callbacks: a malformed body (e.g. a val_id carrying
 * `&store_id=`) is refused before any gateway call, and the customer is sent
 * back to checkout rather than shown a JSON error.
 */
const validateCallback = (schema, fallback) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return res.redirect(303, `${config.urls.storefront}/checkout?payment=${fallback}`);
  req.validatedBody = result.data;
  next();
};

const callbackLimiter = commerceLimiters.paymentCallback;

// SSLCommerz IPN webhook (server-to-server; trusted only after we ask the
// gateway ourselves).
router.post('/ipn', callbackLimiter, validate(ipnSchema), controller.handleIPN);

// SSLCommerz browser redirects.
router.post('/success', callbackLimiter, validateCallback(successCallbackSchema, 'failed'), controller.handleSuccess);
router.post('/fail', callbackLimiter, validateCallback(returnCallbackSchema, 'failed'), controller.handleFail);
router.post('/cancel', callbackLimiter, validateCallback(returnCallbackSchema, 'cancelled'), controller.handleCancel);

// Customer: open a fresh payment page for their own pending order.
router.post('/retry/:orderNumber', authenticate, validate(retryParams, 'params'), controller.retryPayment);

// Super admin: query the gateway for an order now and apply the result.
router.get('/orders/:orderId/reconcile', authenticate, authorize('super_admin'), validate(reconcileParams, 'params'), controller.reconcile);

module.exports = router;
