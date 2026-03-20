const { query } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

const getServices = async () => {
  const result = await query(
    `SELECT id, name, slug, description, base_price
     FROM repair_services
     WHERE is_active = TRUE
     ORDER BY name ASC`
  );
  return result.rows;
};

const trackRepair = async ({ ticket_number, phone }) => {
  if (!ticket_number || !phone) {
    throw ApiError.badRequest('ticket_number and phone are required');
  }

  const result = await query(
    `SELECT
       rt.ticket_number,
       rt.customer_name,
       rt.customer_phone,
       rt.device_type,
       rt.device_brand,
       rt.device_model,
       rt.issue_description,
       rt.status,
       rt.priority,
       rt.assigned_technician,
       rt.estimated_cost,
       rt.final_cost,
       rt.diagnosis_notes,
       rt.internal_notes,
       rt.received_at,
       rt.estimated_completion,
       rt.completed_at,
       rs.name AS service_name,
       b.name  AS branch_name
     FROM repair_tickets rt
     LEFT JOIN repair_services rs ON rs.id = rt.service_id
     LEFT JOIN branches         b  ON b.id  = rt.branch_id
     WHERE rt.ticket_number = $1
       AND rt.customer_phone = $2`,
    [ticket_number, phone]
  );

  if (!result.rows.length) {
    throw ApiError.notFound('No ticket found with that number and phone combination');
  }

  return result.rows[0];
};

const createTicket = async (data) => {
  throw ApiError.internal('Not implemented yet');
};

const getAllTickets = async (queryParams, user) => {
  const { page, limit, offset } = parsePagination(queryParams);

  const params = [limit, offset];
  const branchFilter = user.role === 'branch_admin' && user.branch_id
    ? `AND rt.branch_id = '${user.branch_id}'`
    : '';

  const result = await query(
    `SELECT
       rt.id, rt.ticket_number, rt.customer_name, rt.customer_phone,
       rt.device_type, rt.device_brand, rt.device_model,
       rt.status, rt.priority, rt.assigned_technician,
       rt.estimated_cost, rt.final_cost, rt.received_at,
       b.name AS branch_name
     FROM repair_tickets rt
     LEFT JOIN branches b ON b.id = rt.branch_id
     WHERE TRUE ${branchFilter}
     ORDER BY rt.received_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM repair_tickets rt WHERE TRUE ${branchFilter}`
  );

  return paginatedResponse(result.rows, parseInt(countResult.rows[0].count, 10), { page, limit });
};

const getTicketById = async (id) => {
  const result = await query(
    `SELECT rt.*, b.name AS branch_name, rs.name AS service_name
     FROM repair_tickets rt
     LEFT JOIN branches       b  ON b.id  = rt.branch_id
     LEFT JOIN repair_services rs ON rs.id = rt.service_id
     WHERE rt.id = $1`,
    [id]
  );
  if (!result.rows.length) throw ApiError.notFound('Ticket not found');
  return result.rows[0];
};

const updateTicket = async (id, data) => {
  const allowed = ['status', 'priority', 'assigned_technician', 'estimated_cost', 'final_cost',
    'diagnosis_notes', 'internal_notes', 'estimated_completion'];
  const fields = [];
  const vals = [];
  Object.entries(data).forEach(([k, v]) => {
    if (allowed.includes(k)) {
      vals.push(v);
      fields.push(`${k} = $${vals.length}`);
    }
  });
  if (!fields.length) throw ApiError.badRequest('No valid fields to update');
  vals.push(id);
  const result = await query(
    `UPDATE repair_tickets SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!result.rows.length) throw ApiError.notFound('Ticket not found');
  return result.rows[0];
};

const addRepairPayment = async (ticketId, data) => {
  throw ApiError.internal('Not implemented yet');
};

module.exports = { getServices, trackRepair, createTicket, getAllTickets, getTicketById, updateTicket, addRepairPayment };
