const { z, uuid, slug, httpUrl, nullable, queryBool } = require('../../utils/validators');
const { optText } = require('../categories/category.validation');

const fields = {
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  logo_url: nullable(httpUrl),
  sort_order: z.number().int().min(-1000000).max(1000000).optional(),
  is_active: z.boolean().optional(),
  description: optText(5000),
  meta_title: optText(255),
  meta_description: optText(500),
  banner_url: nullable(httpUrl),
};

const createSchema = z.object(fields);

const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// Accepted for symmetry with categories; brands are flat.
const listQuerySchema = z.object({
  tree: queryBool.optional(),
});

const idOrSlugParams = z.object({
  idOrSlug: z.union([uuid, slug]),
});

module.exports = { createSchema, updateSchema, listQuerySchema, idOrSlugParams };
