const { z, uuid } = require('../../utils/validators');

const addToWishlistSchema = z.object({
  product_id: uuid,
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
