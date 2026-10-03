const config = require('../../config');
const {
  z, uuid, money, positiveMoney, slug, httpUrl, nullable, queryBool, queryInt, searchTerm,
} = require('../../utils/validators');
const { fieldKey } = require('../categories/spec-template');

const CONDITIONS = ['new', 'used', 'refurbished', 'open_box'];
const PUBLIC_SORTS = ['newest', 'price_asc', 'price_desc', 'name'];
const ADMIN_SORTS = ['newest', 'oldest', 'name', 'updated', 'sort_order'];

// ─── Query-string helpers ────────────────────────────────────────────────────

/** Empty query values (?brand=) behave as if absent. */
const opt = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const pageQuery = { page: opt(queryInt(1)), limit: opt(queryInt(1, 100)) };

/** Category/brand slug filter; case-insensitive to forgive hand-typed URLs. */
const slugQuery = z.string().trim().toLowerCase().pipe(slug);

/** "pre-owned" is the storefront's label for used. */
const conditionQuery = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === 'pre-owned' ? 'used' : v))
  .pipe(z.enum(CONDITIONS));

const priceQuery = z.coerce.number().nonnegative().max(999999999);

const priceRange = (v, ctx) => {
  if (v.min_price != null && v.max_price != null && v.min_price > v.max_price) {
    ctx.addIssue({ code: 'custom', path: ['max_price'], message: 'max_price must be at least min_price' });
  }
};

const publicFilters = {
  category: opt(slugQuery),
  brand: opt(slugQuery),
  condition: opt(conditionQuery),
  min_price: opt(priceQuery),
  max_price: opt(priceQuery),
  in_stock: opt(queryBool), // true → only products with an available unit
};

const listQuerySchema = z
  .object({ ...pageQuery, ...publicFilters, sort: opt(z.enum(PUBLIC_SORTS)) })
  .superRefine(priceRange);

const featuredQuerySchema = z.object({ limit: opt(queryInt(1, 24)) });

const searchQuerySchema = z
  .object({
    ...pageQuery,
    ...publicFilters,
    q: z.string({ required_error: 'q is required' }).trim().min(2, 'Search term must be at least 2 characters').max(100),
    sort: opt(z.enum(['relevance', ...PUBLIC_SORTS])),
  })
  .superRefine(priceRange);

const adminListQuerySchema = z.object({
  ...pageQuery,
  q: opt(searchTerm),
  status: opt(z.enum(['active', 'inactive', 'all'])),
  category: opt(z.union([uuid, slugQuery])),
  brand: opt(z.union([uuid, slugQuery])),
  condition: opt(z.enum(CONDITIONS)),
  featured: opt(queryBool),
  low_stock: opt(queryBool),
  sort: opt(z.enum(ADMIN_SORTS)),
});

// ─── Params ──────────────────────────────────────────────────────────────────

const slugParams = z.object({ slug: z.string().trim().min(1).max(280) });
const variantParams = z.object({ variantId: uuid });
const specParams = z.object({ id: uuid, specId: uuid });
const featureParams = z.object({ id: uuid, featureId: uuid });
const imageParams = z.object({ id: uuid, imageId: uuid });

// ─── Body helpers ────────────────────────────────────────────────────────────

/** Optional text; empty strings are stored as NULL. */
const optText = (max) =>
  nullable(z.string().trim().max(max).transform((v) => (v === '' ? null : v)));

const sortOrder = z.number().int().min(-1000000).max(1000000);
const isoDate = z.string().datetime({ offset: true, message: 'Must be an ISO 8601 date-time' });
const nonEmpty = (v) => Object.keys(v).length > 0;

/**
 * Product image URLs must be https in production; plain http is accepted in
 * development for local uploads. Checked at request time (not load time).
 */
const imageUrl = httpUrl.refine(
  (v) => !config.isProd || /^https:\/\//i.test(v),
  'Image URL must use https'
);

/**
 * Pricing rules for a variant. Takes the merged (existing + patch) state so
 * partial updates are checked against what will actually be stored.
 * @returns {Array<[string, string]>} [field, message] pairs
 */
const pricingErrors = (v) => {
  const errs = [];
  const price = v.price != null ? Number(v.price) : null;
  if (price != null && v.compare_at_price != null && Number(v.compare_at_price) <= price) {
    errs.push(['compare_at_price', 'compare_at_price must be greater than price']);
  }
  if (price != null && v.sale_price != null && Number(v.sale_price) >= price) {
    errs.push(['sale_price', 'sale_price must be less than price']);
  }
  if (v.sale_starts_at && v.sale_ends_at && new Date(v.sale_ends_at) <= new Date(v.sale_starts_at)) {
    errs.push(['sale_ends_at', 'sale_ends_at must be after sale_starts_at']);
  }
  return errs;
};

const checkPricing = (v, ctx) => {
  for (const [field, message] of pricingErrors(v)) ctx.addIssue({ code: 'custom', path: [field], message });
};

const uniqueBy = (key, message) => (arr, ctx) => {
  const seen = new Set();
  arr.forEach((item, i) => {
    const k = String(item[key]).toLowerCase();
    if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [i, key], message });
    seen.add(k);
  });
};

// ─── Variants ────────────────────────────────────────────────────────────────

const attributeItem = z.object({
  attribute_key: z.string().trim().min(1).max(80),
  attribute_value: z.string().trim().min(1).max(120),
});
const attributes = z.array(attributeItem).max(30).superRefine(uniqueBy('attribute_key', 'Duplicate attribute'));

const stockItem = z.object({
  branch_id: uuid,
  quantity: z.number().int().min(0).max(100000),
  low_stock_threshold: z.number().int().min(0).max(100000).optional(),
});

// SKUs are normally assigned by the database (PG-10001, …; migration 011).
// A manual SKU is still accepted from scripts/imports, but never in the
// system's own PG-<digits> pattern.
const SYSTEM_SKU = /^PG-\d+$/i;
const variantFields = {
  sku: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'SKU may contain letters, numbers, ".", "_", "-" and "/"')
    .refine((s) => !SYSTEM_SKU.test(s), 'SKUs like PG-10001 are assigned automatically')
    .optional(),
  variant_name: z.string().trim().min(1).max(255),
  color: optText(60),
  price: positiveMoney,
  compare_at_price: nullable(positiveMoney),
  cost_price: nullable(money),
  sale_price: nullable(positiveMoney),
  sale_starts_at: nullable(isoDate),
  sale_ends_at: nullable(isoDate),
  is_active: z.boolean().optional(),
  attributes: attributes.optional(),
};

const createVariantSchema = z
  .object({
    ...variantFields,
    // Initial stock per branch (staff may only stock their own branch).
    stock: z.array(stockItem).max(50).superRefine(uniqueBy('branch_id', 'Duplicate branch')).optional(),
  })
  .superRefine(checkPricing);

const updateVariantSchema = z
  .object(variantFields)
  .partial()
  .superRefine(checkPricing)
  .refine(nonEmpty, 'Nothing to update');

// ─── Specs / features / images ───────────────────────────────────────────────

/**
 * One spec row. `spec_key` is the label. `field_key` links the row to a field
 * of the category's spec template: the server then fills group_name and
 * is_highlight from the template. Rows without one are custom rows.
 */
const specItem = z.object({
  spec_key: z.string().trim().min(1).max(120),
  spec_value: z.string().trim().min(1).max(2000),
  group_name: optText(80),
  field_key: z.preprocess((v) => (v === '' ? null : v), fieldKey.nullable().optional()),
  sort_order: sortOrder.optional(),
});

/** A product holds at most one value per template field. */
const uniqueFieldKeys = (arr, ctx) => {
  const seen = new Set();
  arr.forEach((item, i) => {
    if (!item.field_key) return;
    if (seen.has(item.field_key)) {
      ctx.addIssue({ code: 'custom', path: [i, 'field_key'], message: `Duplicate field_key "${item.field_key}"` });
    }
    seen.add(item.field_key);
  });
};

const specList = z.array(specItem).max(200).superRefine(uniqueFieldKeys);

const addSpecificationSchema = specItem;

const replaceSpecificationsSchema = z.object({
  specifications: specList,
});

const featureText = z.string().trim().min(1).max(255);
/** A key feature may be sent as a string or as { feature }. */
const featureItem = z.union([featureText, z.object({ feature: featureText }).transform((o) => o.feature)]);

const addKeyFeatureSchema = z.object({ feature: featureText, sort_order: sortOrder.optional() });

const replaceKeyFeaturesSchema = z.object({
  key_features: z.array(featureItem).max(50),
});

const oneImageSource = (v, ctx) => {
  if (Boolean(v.media_id) === Boolean(v.image_url)) {
    ctx.addIssue({ code: 'custom', path: ['media_id'], message: 'Provide exactly one of media_id or image_url' });
  }
};

const imageFields = {
  media_id: uuid.optional(),
  image_url: imageUrl.optional(),
  alt_text: optText(255),
  is_primary: z.boolean().optional(),
  sort_order: sortOrder.optional(),
};

const addImageSchema = z
  .object({ ...imageFields, variant_id: nullable(uuid) })
  .superRefine(oneImageSource);

// Images inside POST /products can't know variant ids yet; they may point at
// a variant from the same payload by SKU.
const nestedImageSchema = z
  .object({ ...imageFields, variant_sku: z.string().trim().min(1).max(60).optional() })
  .superRefine(oneImageSource);

const updateImageSchema = z
  .object({
    alt_text: optText(255),
    is_primary: z.boolean().optional(),
    variant_id: nullable(uuid),
  })
  .refine(nonEmpty, 'Nothing to update');

/** Body is either [imageId, …] or { image_ids: [imageId, …] }. */
const reorderImagesSchema = z.union([
  z.array(uuid).min(1).max(100),
  z.object({ image_ids: z.array(uuid).min(1).max(100) }).transform((o) => o.image_ids),
]);

// ─── Products ────────────────────────────────────────────────────────────────

const productFields = {
  name: z.string().trim().min(2).max(255),
  slug: slug.optional(),
  short_description: optText(500),
  description_md: nullable(z.string().max(50000)),
  category_id: uuid,
  brand_id: nullable(uuid),
  condition: z.enum(CONDITIONS),
  condition_notes: optText(2000),
  condition_grade: nullable(
    z.string().trim().toUpperCase().regex(/^[A-D][+-]?$/, 'Grade must look like A+, A, B or C')
  ),
  battery_health: nullable(z.number().int().min(0).max(100)),
  battery_cycles: nullable(z.number().int().min(0).max(100000)),
  accessories: optText(2000),
  warranty_months: nullable(z.number().int().min(0).max(120)),
  warranty_type: nullable(z.enum(['brand', 'shop', 'none'])),
  warranty_notes: optText(2000),
  badge: optText(40),
  sort_order: sortOrder.optional(),
  og_image_url: nullable(httpUrl),
  is_featured: z.boolean().optional(),
  is_active: z.boolean().optional(),
  is_serialized: z.boolean().optional(),
  meta_title: optText(255),
  meta_description: optText(500),
};

const createProductSchema = z.object({
  ...productFields,
  condition: productFields.condition.default('new'),
  variants: z.array(createVariantSchema).max(50).optional(),
  specifications: specList.optional(),
  key_features: z.array(featureItem).max(50).optional(),
  images: z.array(nestedImageSchema).max(30).optional(),
});

const updateProductSchema = z.object(productFields).partial().refine(nonEmpty, 'Nothing to update');

module.exports = {
  CONDITIONS,
  pricingErrors,
  imageUrl,
  isoDate,
  sortOrder,
  optText,
  listQuerySchema,
  featuredQuerySchema,
  searchQuerySchema,
  adminListQuerySchema,
  slugParams,
  variantParams,
  specParams,
  featureParams,
  imageParams,
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  addSpecificationSchema,
  replaceSpecificationsSchema,
  addKeyFeatureSchema,
  replaceKeyFeaturesSchema,
  addImageSchema,
  updateImageSchema,
  reorderImagesSchema,
};
