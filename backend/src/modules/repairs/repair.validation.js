const { z } = require('zod');

const createTicketSchema = z.object({
  customer_name: z.string().min(2).max(120),
  customer_phone: z.string().regex(/^01[3-9]\d{8}$/, 'Invalid Bangladesh phone number'),
  customer_email: z.string().email().optional(),
  device_type: z.string().min(1).max(80),
  device_brand: z.string().max(80).optional(),
  device_model: z.string().max(120).optional(),
  device_serial: z.string().max(120).optional(),
  issue_description: z.string().min(10),
  service_id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

const updateTicketSchema = z.object({
  status: z.enum(['pending', 'diagnosed', 'awaiting_parts', 'repairing', 'ready', 'delivered', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_technician: z.string().max(120).optional(),
  estimated_cost: z.number().positive().optional(),
  final_cost: z.number().positive().optional(),
  internal_notes: z.string().optional(),
  diagnosis_notes: z.string().optional(),
  estimated_completion: z.string().datetime().optional(),
});

const trackRepairSchema = z.object({
  ticket_number: z.string().min(1),
  phone: z.string().regex(/^01[3-9]\d{8}$/),
});

module.exports = { createTicketSchema, updateTicketSchema, trackRepairSchema };
