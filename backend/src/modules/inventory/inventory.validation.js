const {
  z, uuid, money, nullable, queryBool, paginationQuery, searchTerm,
} = require('../../utils/validators');
const { dateParam } = require('../branches/ops.shared');

const MAX_QTY = 100000;
const qty = z.number().int().min(0).max(MAX_QTY);
const note = z.string().trim().max(500);

const uniqueIds = (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

const listQuerySchema = z.object({
  ...paginationQuery,
  branch_id: uuid.optional(),
  product_id: uuid.optional(),
  variant_id: uuid.optional(),
  q: searchTerm.optional(),
  low_stock: queryBool.optional(),
});

// New stock row for a variant at a branch (branch_admin: their own branch).
const createSchema = z.object({
  variant_id: uuid,
  branch_id: uuid.optional(),
  quantity: qty,
  low_stock_threshold: qty.optional(),
  note: note.optional(),
});

// Stock count: `quantity` is the new absolute on-hand count.
const updateSchema = z
  .object({
    quantity: qty.optional(),
    low_stock_threshold: qty.optional(),
    note: note.optional(),
  })
  .refine((v) => v.quantity !== undefined || v.low_stock_threshold !== undefined, 'Nothing to update');

const ADJUST_REASONS = ['received', 'damaged', 'lost', 'correction', 'returned', 'other'];

// Relative change with a reason (goods received, damaged, ...).
const adjustSchema = z.object({
  delta: z.number().int().min(-MAX_QTY).max(MAX_QTY).refine((v) => v !== 0, 'delta must not be 0'),
  reason: z.enum(ADJUST_REASONS),
  note: note.optional(),
});

const transferSchema = z
  .object({
    variant_id: uuid,
    from_branch_id: uuid,
    to_branch_id: uuid,
    quantity: z.number().int().min(1).max(MAX_QTY),
    // Serial-registry units travelling with the stock (must be in_stock at the source).
    unit_ids: z.array(uuid).max(100).refine(uniqueIds, 'unit_ids must be unique').optional(),
    note: note.optional(),
  })
  .refine((v) => v.from_branch_id.toLowerCase() !== v.to_branch_id.toLowerCase(), { message: 'Source and destination branch must differ', path: ['to_branch_id'] })
  .refine((v) => !v.unit_ids || v.unit_ids.length <= v.quantity, { message: 'More unit_ids than quantity', path: ['unit_ids'] });

const movementsQuerySchema = z.object({
  ...paginationQuery,
  variant_id: uuid.optional(),
  product_id: uuid.optional(),
  branch_id: uuid.optional(),
  unit_id: uuid.optional(),
  movement_type: z.string().regex(/^[a-z_]{1,20}$/, 'Invalid movement type').optional(),
  performed_by: uuid.optional(),
  performer: searchTerm.optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
});

// ─── Serial registry ─────────────────────────────────────────

const UNIT_STATUSES = ['in_stock', 'sold', 'returned', 'written_off'];

const serial = z.string().trim().min(1).max(120);
const unitFields = {
  condition_grade: z.string().trim().max(20),
  battery_health: z.number().int().min(0).max(100),
  cosmetic_notes: z.string().trim().max(2000),
  cost_price: money,
  listed_price: money,
  notes: z.string().trim().max(2000),
};

const unitCreateSchema = z.object({
  variant_id: uuid,
  branch_id: uuid.optional(),
  serial_number: serial,
  condition_grade: unitFields.condition_grade.optional(),
  battery_health: unitFields.battery_health.optional(),
  cosmetic_notes: unitFields.cosmetic_notes.optional(),
  cost_price: unitFields.cost_price.optional(),
  listed_price: unitFields.listed_price.optional(),
  notes: unitFields.notes.optional(),
});

const unitUpdateSchema = z
  .object({
    serial_number: serial.optional(),
    condition_grade: nullable(unitFields.condition_grade),
    battery_health: nullable(unitFields.battery_health),
    cosmetic_notes: nullable(unitFields.cosmetic_notes),
    cost_price: nullable(unitFields.cost_price),
    listed_price: nullable(unitFields.listed_price),
    notes: nullable(unitFields.notes),
    status: z.enum(UNIT_STATUSES).optional(),
    // Ledger note when the status change moves stock.
    note: note.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'note'), 'Nothing to update');

const unitListQuerySchema = z.object({
  ...paginationQuery,
  variant_id: uuid.optional(),
  product_id: uuid.optional(),
  branch_id: uuid.optional(),
  status: z.enum([...UNIT_STATUSES, 'reserved']).optional(),
  q: searchTerm.optional(),
});

module.exports = {
  MAX_QTY,
  ADJUST_REASONS,
  UNIT_STATUSES,
  listQuerySchema,
  createSchema,
  updateSchema,
  adjustSchema,
  transferSchema,
  movementsQuerySchema,
  unitCreateSchema,
  unitUpdateSchema,
  unitListQuerySchema,
};
