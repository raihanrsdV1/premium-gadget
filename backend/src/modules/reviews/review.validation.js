const { z, uuid, nullable, paginationQuery, searchTerm } = require('../../utils/validators');

const rating = z.number().int().min(1).max(5);
const title = z.string().trim().max(200);
const body = z.string().trim().max(2000);

const listQuerySchema = z.object({
  ...paginationQuery,
  product_id: uuid,
});

const mineQuerySchema = z.object({
  product_id: uuid.optional(),
});

const createSchema = z.object({
  product_id: uuid,
  rating,
  title: title.optional(),
  body: body.optional(),
});

const updateSchema = z
  .object({
    rating: rating.optional(),
    title: nullable(title),
    body: nullable(body),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const adminQuerySchema = z.object({
  ...paginationQuery,
  status: z.enum(['pending', 'approved', 'all']).default('pending'),
  product_id: uuid.optional(),
  q: searchTerm.optional(),
});

const moderationSchema = z.object({
  is_approved: z.boolean(),
});

module.exports = {
  listQuerySchema, mineQuerySchema, createSchema, updateSchema, adminQuerySchema, moderationSchema,
};
