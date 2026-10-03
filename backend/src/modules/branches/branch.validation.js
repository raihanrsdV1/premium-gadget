const { z, uuid, slug, httpUrl, bdPhone, nullable } = require('../../utils/validators');

// Shop landlines (e.g. 031-2510000) are allowed, so not bdPhone.
const contactPhone = z
  .string()
  .trim()
  .max(20)
  .regex(/^\+?\d[\d\s-]{5,19}$/, 'Invalid phone number');

const fields = {
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  address: z.string().trim().min(5).max(500),
  phone: nullable(contactPhone),
  whatsapp: nullable(bdPhone),
  email: nullable(z.string().trim().toLowerCase().email().max(255)),
  opening_hours: nullable(z.string().trim().max(255)),
  map_url: nullable(httpUrl),
  lat: nullable(z.number().min(-90).max(90)),
  lng: nullable(z.number().min(-180).max(180)),
  sort_order: z.number().int().min(-10000).max(10000).optional(),
  is_active: z.boolean().optional(),
};

const createBranchSchema = z.object(fields);

const updateBranchSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** `/:idOrSlug` — a branch UUID or its slug. */
const idOrSlugParams = z.object({ idOrSlug: z.union([uuid, slug]) });

module.exports = { createBranchSchema, updateBranchSchema, idOrSlugParams };
