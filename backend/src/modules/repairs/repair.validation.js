const {
  z, uuid, bdPhone, money, positiveMoney, slug, nullable, paginationQuery, searchTerm,
} = require('../../utils/validators');
const { dateParam } = require('../branches/ops.shared');

const STATUSES = ['pending', 'diagnosed', 'awaiting_parts', 'repairing', 'ready', 'delivered', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PAYMENT_METHODS = ['cash', 'card', 'bkash', 'nagad'];

const text = (max) => z.string().trim().max(max);
const datetime = z.string().datetime({ offset: true });

// What a customer may submit from the storefront. Status, costs, priority and
// notes are staff-only and are stripped if sent.
const customerFields = {
  customer_name: z.string().trim().min(2).max(120),
  customer_phone: bdPhone,
  customer_email: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('').transform(() => undefined)),
  device_type: z.string().trim().min(1).max(80),
  device_brand: text(80).optional(),
  device_model: text(120).optional(),
  device_serial: text(120).optional(),
  issue_description: z.string().trim().min(10).max(2000),
  service_id: uuid.optional(),
  branch_id: uuid.optional(),
};

const createTicketSchema = z.object(customerFields);

// Counter intake by staff: the same plus triage fields.
const walkInTicketSchema = z.object({
  ...customerFields,
  priority: z.enum(PRIORITIES).default('medium'),
  assigned_technician: text(120).optional(),
  estimated_cost: money.optional(),
  estimated_completion: datetime.optional(),
  diagnosis_notes: text(5000).optional(),
  internal_notes: text(5000).optional(),
  customer_notes: text(2000).optional(),
});

// Staff edits. null clears a field.
const updateTicketSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    service_id: nullable(uuid),
    assigned_technician: nullable(text(120)),
    estimated_cost: nullable(money),
    final_cost: nullable(money),
    estimated_completion: nullable(datetime),
    diagnosis_notes: nullable(text(5000)),
    internal_notes: nullable(text(5000)),
    customer_notes: nullable(text(2000)),
    device_serial: nullable(text(120)),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const trackRepairSchema = z.object({
  ticket_number: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
  phone: bdPhone,
});

const listTicketsQuerySchema = z.object({
  ...paginationQuery,
  branch_id: uuid.optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  service_id: uuid.optional(),
  q: searchTerm.optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
});

const paymentSchema = z.object({
  amount: positiveMoney,
  payment_method: z.enum(PAYMENT_METHODS),
  notes: text(500).optional(),
});

// ─── Service price list ──────────────────────────────────────

const serviceFields = {
  name: z.string().trim().min(2).max(180),
  slug: slug.optional(),
  description: nullable(text(2000)),
  base_price: nullable(money),
  is_active: z.boolean().optional(),
};

const createServiceSchema = z.object(serviceFields);
const updateServiceSchema = z
  .object(serviceFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

module.exports = {
  STATUSES,
  PRIORITIES,
  createTicketSchema,
  walkInTicketSchema,
  updateTicketSchema,
  trackRepairSchema,
  listTicketsQuerySchema,
  paymentSchema,
  createServiceSchema,
  updateServiceSchema,
};
