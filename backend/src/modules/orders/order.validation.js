const { z } = require('zod');

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'At least one item is required'),
  shipping_method: z.enum(['inside_dhaka', 'outside_dhaka']).default('inside_dhaka'),
  shipping_address: z
    .object({
      full_name: z.string().max(120).optional(),
      phone: z.string().max(20).optional(),
      division: z.string().max(60).optional(),
      district: z.string().max(60).optional(),
      street: z.string().max(255).optional(),
    })
    .optional(),
  address_id: z.string().uuid().optional(),
  coupon_code: z.string().min(1).max(40).optional(),
  payment_method: z.enum(['card', 'bkash', 'nagad', 'net_banking']).optional(),
});

/**
 * Zod validation middleware factory.
 * @param {z.ZodSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(result.error);
  }
  req.validatedBody = result.data;
  next();
};

module.exports = { createOrderSchema, validate };
