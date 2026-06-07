const { z } = require('zod');

const addToWishlistSchema = z.object({
  product_id: z.string().uuid(),
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

module.exports = { addToWishlistSchema, validate };
