const { z } = require('zod');

/**
 * inventory validation schemas.
 */

const createSchema = z.object({
  // TODO: Define fields
});

// Manual stock adjustment: `quantity` is the new absolute on-hand count.
const updateSchema = z.object({
  quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
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

module.exports = { createSchema, updateSchema, validate };
