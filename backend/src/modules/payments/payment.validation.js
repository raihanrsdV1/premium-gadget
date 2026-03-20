const { z } = require('zod');

const initiatePaymentSchema = z.object({
  order_id: z.string().uuid(),
  payment_method: z.enum(['card', 'bkash', 'nagad', 'net_banking']),
});

module.exports = { initiatePaymentSchema };
