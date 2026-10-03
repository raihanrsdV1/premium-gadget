const { z, uuid } = require('../../utils/validators');
const { GATEWAY_ID } = require('./gateway.shared');

/**
 * SSLCommerz callback bodies. The gateway posts ~30 fields; we only read the
 * identifiers needed to ask the gateway itself what happened, and everything
 * else is stripped. Identifiers must match GATEWAY_ID so nothing can be
 * smuggled into the gateway query string (SEC-02).
 */
const gatewayId = z.string().regex(GATEWAY_ID, 'Invalid gateway reference');
const blankToUndefined = (v) => (v === null || v === '' ? undefined : v);

/** success_url: val_id is mandatory; tran_id is only used to label a "pending" redirect. */
const successCallbackSchema = z.object({
  val_id: gatewayId,
  tran_id: gatewayId.optional().catch(undefined),
});

/** fail_url / cancel_url. */
const returnCallbackSchema = z.object({
  tran_id: gatewayId,
});

/** ipn_url: a validated payment carries val_id; failures carry only tran_id + status. */
const ipnSchema = z
  .object({
    val_id: z.preprocess(blankToUndefined, gatewayId.optional()),
    tran_id: z.preprocess(blankToUndefined, gatewayId.optional()),
    status: z.string().max(30).optional().catch(undefined),
  })
  .refine((v) => v.val_id || v.tran_id, 'val_id or tran_id is required');

const retryParams = z.object({ orderNumber: gatewayId });

const reconcileParams = z.object({ orderId: uuid });

module.exports = { successCallbackSchema, returnCallbackSchema, ipnSchema, retryParams, reconcileParams };
