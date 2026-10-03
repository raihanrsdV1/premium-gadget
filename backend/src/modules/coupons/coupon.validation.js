const {
  z, uuid, money, positiveMoney, nullable, paginationQuery, searchTerm,
} = require('../../utils/validators');

/** Codes are stored upper-case and matched case-insensitively. */
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, 'Code must be 3-40 characters: letters, digits, _ or -');

const timestamp = z
  .string()
  .datetime({ offset: true, message: 'Use an ISO 8601 date-time, e.g. 2026-10-03T00:00:00+06:00' })
  .transform((s) => new Date(s));

const fields = {
  code,
  description: nullable(z.string().trim().max(500)),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: positiveMoney,
  min_order_value: money,
  max_uses: nullable(z.number().int().min(1).max(1000000)),
  max_discount: nullable(positiveMoney),
  per_user_limit: nullable(z.number().int().min(1).max(1000)),
  channel: z.enum(['all', 'online', 'pos']),
  valid_from: timestamp,
  valid_until: timestamp,
  is_active: z.boolean(),
};

/**
 * Cross-field rules, applied to a full coupon (on create, and to the merged
 * row on update).
 */
const couponRules = (v, ctx) => {
  if (v.discount_type === 'percentage' && (Number(v.discount_value) < 1 || Number(v.discount_value) > 100)) {
    ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'A percentage discount must be between 1 and 100' });
  }
  if (new Date(v.valid_until) <= new Date(v.valid_from)) {
    ctx.addIssue({ code: 'custom', path: ['valid_until'], message: 'valid_until must be after valid_from' });
  }
};

const createSchema = z
  .object({
    ...fields,
    min_order_value: money.default(0),
    channel: fields.channel.default('all'),
    is_active: fields.is_active.default(true),
  })
  .superRefine(couponRules);

const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Re-validates a merged (existing + patch) coupon. */
const fullCouponSchema = z
  .object({
    discount_type: fields.discount_type,
    discount_value: z.coerce.number(),
    valid_from: z.coerce.date(),
    valid_until: z.coerce.date(),
  })
  .passthrough()
  .superRefine(couponRules);

const listQuerySchema = z.object({
  ...paginationQuery,
  status: z.enum(['active', 'expired', 'inactive', 'scheduled']).optional(),
  channel: z.enum(['all', 'online', 'pos']).optional(),
  q: searchTerm.optional(),
});

const validateCartSchema = z.object({
  code: z.string().trim().min(1).max(40),
  items: z
    .array(z.object({ variant_id: uuid, quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((i) => i.variant_id)).size === items.length, 'Each product may appear only once'),
});

module.exports = { createSchema, updateSchema, fullCouponSchema, listQuerySchema, validateCartSchema };
