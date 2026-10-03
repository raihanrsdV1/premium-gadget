const { z, uuid, httpUrl, nullable } = require('../../utils/validators');
const { imageUrl, isoDate, sortOrder, optText } = require('../products/product.validation');

const PLACEMENTS = ['hero', 'promo'];
const STATUSES = ['live', 'scheduled', 'expired', 'inactive'];

/** Empty query values (?placement=) behave as if absent. */
const opt = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

// A site path ("/repairs", "/products?category=x"). "//host" and "/\host"
// are rejected: browsers resolve both to another origin.
const SITE_PATH = /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/;

/** Where a slide links to: a site path or an http(s) URL (never javascript:, data:, //host). */
const linkUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => SITE_PATH.test(v) || httpUrl.safeParse(v).success,
    'Link must be a site path starting with a single "/" or an http(s) URL'
  );

/** Optional, nullable; an empty string (a cleared form input) means null. */
const blankToNull = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

const checkWindow = (v, ctx) => {
  if (v.starts_at && v.ends_at && new Date(v.ends_at) <= new Date(v.starts_at)) {
    ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'ends_at must be after starts_at' });
  }
};

const fields = {
  placement: z.enum(PLACEMENTS),
  product_id: nullable(uuid),
  title: optText(120),
  subtitle: optText(200),
  badge: optText(30),
  image_url: blankToNull(imageUrl),
  mobile_image_url: blankToNull(imageUrl),
  cta_label: optText(40),
  link_url: blankToNull(linkUrl),
  sort_order: sortOrder.optional(),
  is_active: z.boolean().optional(),
  starts_at: nullable(isoDate),
  ends_at: nullable(isoDate),
};

const createSchema = z
  .object({ ...fields, placement: fields.placement.default('hero') })
  .superRefine((v, ctx) => {
    if (!v.product_id && !v.image_url) {
      ctx.addIssue({ code: 'custom', path: ['image_url'], message: 'A banner needs a product_id or an image_url' });
    }
    checkWindow(v, ctx);
  });

const updateSchema = z
  .object(fields)
  .partial()
  .superRefine(checkWindow)
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Body is { placement, ids: [bannerId, …] } listing every banner of that placement once. */
const reorderSchema = z.object({
  placement: z.enum(PLACEMENTS),
  ids: z.array(uuid).min(1).max(200),
});

const publicQuerySchema = z.object({ placement: opt(z.enum(PLACEMENTS)) });

const adminQuerySchema = z.object({
  placement: opt(z.enum(PLACEMENTS)),
  status: opt(z.enum(STATUSES)),
});

module.exports = {
  PLACEMENTS,
  STATUSES,
  SITE_PATH,
  createSchema,
  updateSchema,
  reorderSchema,
  publicQuerySchema,
  adminQuerySchema,
};
