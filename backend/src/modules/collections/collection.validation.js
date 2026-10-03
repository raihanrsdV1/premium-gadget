const { z, uuid, slug, nullable, queryInt } = require('../../utils/validators');
const { imageUrl, isoDate, optText } = require('../products/product.validation');

const TONES = ['coral', 'blue', 'navy', 'green', 'amber'];
const SOURCES = ['manual', 'newest', 'on_sale', 'best_selling', 'featured'];
const LAYOUTS = ['carousel', 'grid', 'countdown'];
// Sources whose products depend on a look-back window.
const WINDOWED = ['newest', 'best_selling'];

const blankToNull = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

const fields = {
  name: z.string().trim().min(1).max(80),
  slug: slug.max(100),
  description: optText(2000),
  badge_label: optText(24),
  badge_tone: z.enum(TONES),
  source: z.enum(SOURCES),
  source_days: nullable(z.number().int().min(1).max(365)),
  show_on_home: z.boolean(),
  home_limit: z.number().int().min(1).max(24),
  home_layout: z.enum(LAYOUTS),
  is_active: z.boolean(),
  starts_at: nullable(isoDate),
  ends_at: nullable(isoDate),
  banner_url: blankToNull(imageUrl),
  meta_title: optText(120),
  meta_description: optText(320),
};

/** Cross-field rules, checked on the merged state. */
const checkRules = (v, ctx) => {
  if (v.starts_at && v.ends_at && new Date(v.ends_at) <= new Date(v.starts_at)) {
    ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'ends_at must be after starts_at' });
  }
  if (v.home_layout === 'countdown' && !v.ends_at) {
    ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'A countdown layout needs an ends_at' });
  }
};

const createSchema = z
  .object({ ...fields, slug: fields.slug.optional() })
  .partial({
    description: true, badge_label: true, badge_tone: true, source: true, source_days: true, show_on_home: true,
    home_limit: true, home_layout: true, is_active: true, starts_at: true, ends_at: true, banner_url: true,
    meta_title: true, meta_description: true,
  })
  .superRefine(checkRules);

const updateSchema = z
  .object(fields)
  .partial()
  .superRefine(checkRules)
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** The merged state is re-checked in the service (partial updates). */
const checkMerged = checkRules;

const productIds = z.array(uuid).max(200).superRefine((ids, ctx) => {
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'product_ids must be unique' });
});

const setProductsSchema = z.object({ product_ids: productIds });

const homeOrderSchema = z.object({
  ids: z.array(uuid).min(1).max(100).superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'ids must be unique' });
  }),
});

const productCollectionsSchema = z.object({
  collection_ids: z.array(uuid).max(50).superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'collection_ids must be unique' });
  }),
});

/** Empty query values behave as if absent; arrays fail the schema (400). */
const opt = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const publicListQuery = z.object({
  home: opt(z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')),
});

const slugParams = z.object({ slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/i, 'Invalid slug') });

const productsQuery = z.object({
  page: opt(queryInt(1)),
  limit: opt(queryInt(1, 100)),
  sort: opt(z.enum(['price_asc', 'price_desc', 'newest'])),
});

module.exports = {
  TONES, SOURCES, LAYOUTS, WINDOWED,
  createSchema, updateSchema, checkMerged, setProductsSchema, homeOrderSchema,
  productCollectionsSchema, publicListQuery, slugParams, productsQuery,
};
