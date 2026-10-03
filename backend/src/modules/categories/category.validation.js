const { z, uuid, slug, httpUrl, nullable, queryBool } = require('../../utils/validators');

/** Optional text; empty strings are stored as NULL. */
const optText = (max) =>
  nullable(z.string().trim().max(max).transform((v) => (v === '' ? null : v)));

const fields = {
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  parent_id: nullable(uuid),
  icon_url: nullable(httpUrl),
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

const listQuerySchema = z.object({
  tree: queryBool.optional(),
});

/** Public lookup by id or slug. */
const idOrSlugParams = z.object({
  idOrSlug: z.union([uuid, slug]),
});

module.exports = { createSchema, updateSchema, listQuerySchema, idOrSlugParams, optText };
