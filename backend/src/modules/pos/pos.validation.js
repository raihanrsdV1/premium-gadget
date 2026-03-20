const { z } = require('zod');

const createPOSSaleSchema = z.object({
  items: z.array(z.object({
    variant_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_price: z.number().positive(),
  })).min(1, 'At least one item is required'),
  customer_name: z.string().max(120).optional(),
  customer_phone: z.string().regex(/^01[3-9]\d{8}$/).optional(),
  discount: z.number().min(0).default(0),
  payment_method: z.enum(['cash', 'card', 'bkash', 'nagad']).default('cash'),
});

module.exports = { createPOSSaleSchema };
