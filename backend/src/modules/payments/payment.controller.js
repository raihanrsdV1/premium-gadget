const asyncHandler = require('../../utils/asyncHandler');
const config = require('../../config');
const paymentService = require('./payment.service');

const { OUTCOME } = paymentService;

/**
 * Storefront checkout page with a status and, if the caller sent one, the
 * order reference it sent (format-validated). The reference is echoed the
 * same way whether or not such an order exists, so the unauthenticated
 * callbacks can't be used to probe order numbers.
 */
const checkoutPage = (status, clientRef) =>
  `${config.urls.storefront}/checkout?payment=${status}${clientRef ? `&ref=${encodeURIComponent(clientRef)}` : ''}`;

/**
 * Where to send the browser after the gateway's success redirect. The
 * order-success page is shown ONLY for an order confirmed by a verified
 * payment (its number comes from the gateway's own record).
 *
 * @param {{ outcome: string, ref?: string }} result
 * @param {string|undefined} clientRef - tran_id from the callback body
 */
const successRedirect = (result, clientRef) => {
  switch (result.outcome) {
    case OUTCOME.SUCCESS:
      return `${config.urls.storefront}/order-success?ref=${encodeURIComponent(result.ref)}`;
    case OUTCOME.HELD:
    case OUTCOME.PENDING:
      return checkoutPage('pending', clientRef);
    default:
      return checkoutPage('failed', clientRef);
  }
};

/**
 * success_url (browser POST-redirect from the gateway). On an unexpected
 * error nothing was changed, so the customer sees "pending", not "failed".
 */
const handleSuccess = async (req, res) => {
  let result;
  try {
    result = await paymentService.handleValidatedCallback(req.validatedBody, 'success');
  } catch (err) {
    console.error('❌ payment success callback error:', err);
    result = { outcome: OUTCOME.PENDING };
  }
  res.redirect(303, successRedirect(result, req.validatedBody.tran_id));
};

/**
 * fail_url / cancel_url: settle with the gateway, then always the same
 * redirect for the same input, whatever the order's state (or existence).
 */
const returnHandler = (reason) => async (req, res) => {
  try {
    await paymentService.handleGatewayReturn(req.validatedBody, reason);
  } catch (err) {
    console.error(`❌ payment ${reason} callback error:`, err);
  }
  res.redirect(303, checkoutPage(reason, req.validatedBody.tran_id));
};

/**
 * IPN — called by SSLCommerz servers, not the user's browser. The response
 * is constant so it reveals nothing about orders; anything left undecided
 * (e.g. the gateway was unreachable) is settled by the expiry job.
 */
const handleIPN = async (req, res) => {
  try {
    await paymentService.handleIpn(req.validatedBody);
  } catch (err) {
    console.error('❌ payment IPN error:', err);
  }
  res.json({ success: true });
};

const retryPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.retryPayment(req.validatedParams.orderNumber, req.user);
  res.json({ success: true, data: result });
});

const reconcile = asyncHandler(async (req, res) => {
  const result = await paymentService.reconcileForStaff(req.validatedParams.orderId, req.user);
  res.json({ success: true, data: result });
});

module.exports = {
  successRedirect,
  handleSuccess,
  handleFail: returnHandler('failed'),
  handleCancel: returnHandler('cancelled'),
  handleIPN,
  retryPayment,
  reconcile,
};
