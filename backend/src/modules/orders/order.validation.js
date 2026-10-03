const {
  z, uuid, bdPhone, paginationQuery, searchTerm,
} = require('../../utils/validators');
const { ORDER_STATUSES } = require('./order.lifecycle');

/** The eight divisions of Bangladesh (current official spellings). */
const DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh'];
// Accept any casing plus the pre-2018 English spellings still in common use.
const DIVISION_ALIASES = { chittagong: 'Chattogram', barisal: 'Barishal' };
const DIVISION_LOOKUP = Object.fromEntries(DIVISIONS.map((d) => [d.toLowerCase(), d]));

const division = z.preprocess(
  (v) => (typeof v === 'string' ? DIVISION_LOOKUP[v.trim().toLowerCase()] || DIVISION_ALIASES[v.trim().toLowerCase()] || v : v),
  z.enum(DIVISIONS, { errorMap: () => ({ message: 'Must be one of the 8 divisions of Bangladesh' }) })
);

// '' and null mean "not provided" for optional text fields from HTML forms.
const blankToUndefined = (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v);
const optionalText = (max) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const ONLINE_PAYMENT_METHODS = ['card', 'bkash', 'nagad', 'net_banking'];
const CHECKOUT_PAYMENT_METHODS = ['cod', ...ONLINE_PAYMENT_METHODS];

const shippingAddressSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: bdPhone,
  division,
  district: z.string().trim().min(2).max(60),
  area: optionalText(120),
  street: z.string().trim().min(3).max(255),
  postal_code: z.preprocess(blankToUndefined, z.string().trim().regex(/^\d{4}$/, 'Postal code must be 4 digits').optional()),
});

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: uuid,
        quantity: z.number().int().min(1).max(10),
      })
    )
    .min(1, 'At least one item is required')
    .max(20, 'At most 20 different items per order')
    .refine((items) => new Set(items.map((i) => i.variant_id)).size === items.length, 'Each product may appear only once'),
  shipping_method: z.preprocess(
    blankToUndefined,
    z.string().trim().max(40).regex(/^[a-z0-9_]+$/, 'Invalid shipping method').optional()
  ),
  shipping_address: shippingAddressSchema,
  address_id: z.preprocess(blankToUndefined, uuid.optional()),
  coupon_code: z.preprocess(blankToUndefined, z.string().trim().min(1).max(40).optional()),
  customer_note: optionalText(500),
  payment_method: z.enum(CHECKOUT_PAYMENT_METHODS).default('card'),
});

// Order numbers double as gateway tran_ids, so they share its alphabet.
const orderNumberParams = z.object({
  orderNumber: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid order number'),
});

const PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];
const PAYMENT_METHODS = ['card', 'bkash', 'nagad', 'net_banking', 'cash', 'other', 'cod'];
const isoDay = z.string().date('Use YYYY-MM-DD');

const listQuerySchema = z
  .object({
    ...paginationQuery,
    status: z.enum(ORDER_STATUSES).optional(),
    payment_status: z.enum(PAYMENT_STATUSES).optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional(),
    channel: z.enum(['online', 'pos']).optional(),
    branch_id: uuid.optional(),
    q: searchTerm.optional(),
    from: isoDay.optional(),
    to: isoDay.optional(),
    sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '"from" must not be after "to"', path: ['from'] });

const MANUAL_PAYMENT_METHODS = ['card', 'bkash', 'nagad', 'net_banking', 'cash', 'other'];

const statusUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    note: optionalText(500),
    tracking_number: z.preprocess(
      blankToUndefined,
      z.string().trim().max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 _./#-]*$/, 'Invalid tracking number').optional()
    ),
    courier: optionalText(60),
    // super_admin only: record an off-gateway payment while confirming.
    mark_paid: z.boolean().optional(),
    payment_method: z.enum(MANUAL_PAYMENT_METHODS).optional(),
    // Returns: put the items back into sellable stock (default true).
    restock: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mark_paid && v.status !== 'confirmed') {
      ctx.addIssue({ code: 'custom', path: ['mark_paid'], message: 'mark_paid is only allowed when confirming' });
    }
    if (v.mark_paid && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'A note is required when marking an order paid' });
    }
    if ((v.tracking_number || v.courier) && v.status !== 'shipped') {
      ctx.addIssue({ code: 'custom', path: ['tracking_number'], message: 'Tracking details can only be set when shipping' });
    }
    if (v.restock !== undefined && v.status !== 'returned') {
      ctx.addIssue({ code: 'custom', path: ['restock'], message: 'restock only applies to returns' });
    }
  });

const adminNoteSchema = z.object({
  admin_note: z.union([z.string().trim().max(5000), z.null()]),
});

const paymentUpdateSchema = z.object({
  payment_status: z.literal('refunded'),
  note: z.string().trim().min(3).max(500),
});

module.exports = {
  DIVISIONS,
  divisionSchema: division,
  ONLINE_PAYMENT_METHODS,
  CHECKOUT_PAYMENT_METHODS,
  shippingAddressSchema,
  checkoutSchema,
  createOrderSchema: checkoutSchema,
  orderNumberParams,
  listQuerySchema,
  statusUpdateSchema,
  adminNoteSchema,
  paymentUpdateSchema,
};
