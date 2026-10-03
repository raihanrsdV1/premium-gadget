const {
  z, uuid, bdPhone, money, positiveMoney, queryBool, paginationQuery, searchTerm,
} = require('../../utils/validators');
const { dateParam } = require('../branches/ops.shared');

const PAYMENT_METHODS = ['cash', 'card', 'bkash', 'nagad'];

const lower = (ids) => ids.map((id) => id.toLowerCase());
const unique = (ids) => new Set(lower(ids)).size === ids.length;

const saleItem = z
  .object({
    variant_id: uuid,
    quantity: z.number().int().min(1).max(1000),
    // The server prices every line. A different price is an override and
    // must carry a reason; it is capped for branch_admin and audited.
    unit_price: positiveMoney.optional(),
    price_override_reason: z.string().trim().min(3).max(255).optional(),
    // Serial-registry units handed over on this line.
    unit_ids: z.array(uuid).max(1000).refine(unique, 'unit_ids must be unique').optional(),
  })
  .refine((i) => (i.unit_price === undefined) === (i.price_override_reason === undefined), {
    message: 'unit_price and price_override_reason must be sent together',
    path: ['price_override_reason'],
  })
  .refine((i) => !i.unit_ids || i.unit_ids.length <= i.quantity, {
    message: 'More unit_ids than quantity',
    path: ['unit_ids'],
  });

const createSaleSchema = z
  .object({
    items: z.array(saleItem).min(1, 'At least one item is required').max(100),
    // Only a super_admin without a branch of their own needs this.
    branch_id: uuid.optional(),
    customer_name: z.string().trim().min(1).max(120).optional(),
    customer_phone: bdPhone.optional(),
    discount: money.default(0),
    discount_reason: z.string().trim().max(255).optional(),
    coupon_code: z.string().trim().min(1).max(40).optional(),
    payment_method: z.enum(PAYMENT_METHODS).default('cash'),
    note: z.string().trim().max(500).optional(),
  })
  .refine((s) => unique(s.items.map((i) => i.variant_id)), {
    message: 'Each variant may appear only once — use quantity',
    path: ['items'],
  })
  .refine((s) => unique(s.items.flatMap((i) => i.unit_ids || [])), {
    message: 'A unit can only be sold once',
    path: ['items'],
  });

const listSalesQuerySchema = z.object({
  ...paginationQuery,
  branch_id: uuid.optional(),
  operator_id: uuid.optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  q: searchTerm.optional(),
  voided: queryBool.optional(),
});

const voidSaleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const catalogQuerySchema = z.object({
  q: searchTerm.min(1),
  branch_id: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = {
  PAYMENT_METHODS,
  createSaleSchema,
  listSalesQuerySchema,
  voidSaleSchema,
  catalogQuerySchema,
};
