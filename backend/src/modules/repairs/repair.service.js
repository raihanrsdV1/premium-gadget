const { query, withTransaction } = require('../../config/database');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { generateTicketNumber } = require('../../utils/generateOrderNumber');
const { escapeLike } = require('../../utils/validators');
const { round2 } = require('../../utils/pricing');
const { audit } = require('../../utils/audit');
const {
  listBranchScope, writeBranchScope, assertBranchAccess, addDateRange, uniqueSlug,
} = require('../branches/ops.shared');

const TICKET_NOT_FOUND = 'Ticket not found';
// Same message whether the ticket number or the phone is wrong, so the
// tracking endpoint can't be used to probe which tickets exist.
const TRACK_NOT_FOUND = 'No ticket found with that number and phone combination';
const EPS = 1e-9;

const PAID_SQL = `COALESCE((SELECT SUM(t.amount) FROM repair_transactions t
                             WHERE t.ticket_id = rt.id AND t.payment_status = 'completed'), 0)`;

const balanceDue = (finalCost, paid) =>
  (finalCost === null || finalCost === undefined ? null : round2(Math.max(Number(finalCost) - paid, 0)));

// ─── Service price list ──────────────────────────────────────

/** Public price list (shape used by the storefront — keep it stable). */
const getServices = async () => {
  const result = await query(
    `SELECT id, name, slug, description, base_price
       FROM repair_services
      WHERE is_active = TRUE
      ORDER BY name ASC`
  );
  return result.rows;
};

/** Every service, including inactive ones, with how many tickets use it. */
const listServicesAdmin = async () => {
  const { rows } = await query(
    `SELECT rs.id, rs.name, rs.slug, rs.description, rs.base_price, rs.is_active, rs.created_at, rs.updated_at,
            (SELECT COUNT(*)::int FROM repair_tickets rt WHERE rt.service_id = rs.id) AS ticket_count
       FROM repair_services rs
      ORDER BY rs.is_active DESC, rs.name ASC`
  );
  return rows;
};

const SERVICE_FIELDS = 'id, name, slug, description, base_price, is_active, created_at, updated_at';
const SERVICE_WRITABLE = ['name', 'slug', 'description', 'base_price', 'is_active'];

const assertServiceSlugFree = async (slug, exceptId = null) => {
  const { rows } = await query('SELECT 1 FROM repair_services WHERE slug = $1 AND id IS DISTINCT FROM $2', [slug, exceptId]);
  if (rows.length) throw ApiError.conflict('Another service already uses this slug');
};

/** Create a price-list entry (super_admin). */
const createService = async (data, actor) => {
  const values = { ...data };
  if (values.slug) await assertServiceSlugFree(values.slug);
  else values.slug = await uniqueSlug({ query }, 'repair_services', values.name, 'service');
  const cols = SERVICE_WRITABLE.filter((k) => values[k] !== undefined);
  const { rows } = await query(
    `INSERT INTO repair_services (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${SERVICE_FIELDS}`,
    cols.map((k) => values[k])
  );
  await audit({ actor, action: 'repair_service.create', entity: 'repair_service', entityId: rows[0].id, data: values });
  return rows[0];
};

/** Update a price-list entry (super_admin). */
const updateService = async (id, data, actor) => {
  if (data.slug) await assertServiceSlugFree(data.slug, id);
  const cols = SERVICE_WRITABLE.filter((k) => data[k] !== undefined);
  const vals = cols.map((k) => data[k]);
  vals.push(id);
  const { rows } = await query(
    `UPDATE repair_services SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}
      WHERE id = $${vals.length} RETURNING ${SERVICE_FIELDS}`,
    vals
  );
  if (!rows.length) throw ApiError.notFound('Repair service not found');
  await audit({ actor, action: 'repair_service.update', entity: 'repair_service', entityId: id, data });
  return rows[0];
};

/**
 * Delete a service (super_admin). One that tickets reference is deactivated
 * instead so ticket history keeps its service name.
 *
 * @returns {Promise<{ deleted: boolean, deactivated: boolean }>}
 */
const removeService = async (id, actor) => {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM repair_services WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) throw ApiError.notFound('Repair service not found');
    const used = await client.query('SELECT 1 FROM repair_tickets WHERE service_id = $1 LIMIT 1', [id]);
    if (used.rows.length) {
      await client.query('UPDATE repair_services SET is_active = FALSE WHERE id = $1', [id]);
      await audit({ actor, action: 'repair_service.deactivate', entity: 'repair_service', entityId: id, db: client });
      return { deleted: false, deactivated: true };
    }
    await client.query('DELETE FROM repair_services WHERE id = $1', [id]);
    await audit({ actor, action: 'repair_service.delete', entity: 'repair_service', entityId: id, db: client });
    return { deleted: true, deactivated: false };
  });
};

// ─── Tickets ─────────────────────────────────────────────────

/** The branch a new ticket goes to: the given active one, else the first active. */
const resolveTicketBranch = async (db, branchId) => {
  if (branchId) {
    const { rows } = await db.query('SELECT id, name, phone, is_active FROM branches WHERE id = $1', [branchId]);
    if (!rows.length || !rows[0].is_active) throw ApiError.badRequest('Branch not found or not accepting repairs');
    return rows[0];
  }
  const { rows } = await db.query(
    'SELECT id, name, phone FROM branches WHERE is_active ORDER BY sort_order ASC, created_at ASC LIMIT 1'
  );
  if (!rows.length) throw new ApiError(503, 'Repair booking is not available right now');
  return rows[0];
};

const assertActiveService = async (db, serviceId) => {
  if (!serviceId) return;
  const { rows } = await db.query('SELECT is_active FROM repair_services WHERE id = $1', [serviceId]);
  if (!rows.length || !rows[0].is_active) throw ApiError.badRequest('Repair service not found');
};

const insertTicket = async (client, t) => {
  const { rows } = await client.query(
    `INSERT INTO repair_tickets
       (ticket_number, customer_id, customer_name, customer_phone, customer_email,
        device_type, device_brand, device_model, device_serial, issue_description,
        service_id, branch_id, priority, assigned_technician, estimated_cost,
        estimated_completion, diagnosis_notes, internal_notes, customer_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::ticket_priority, 'medium'::ticket_priority),
             $14, $15, $16, $17, $18, $19)
     RETURNING id, ticket_number, status`,
    [
      await generateTicketNumber(client), t.customer_id ?? null, t.customer_name, t.customer_phone,
      t.customer_email ?? null, t.device_type, t.device_brand ?? null, t.device_model ?? null,
      t.device_serial ?? null, t.issue_description, t.service_id ?? null, t.branch_id,
      t.priority ?? null, t.assigned_technician ?? null, t.estimated_cost ?? null,
      t.estimated_completion ?? null, t.diagnosis_notes ?? null, t.internal_notes ?? null,
      t.customer_notes ?? null,
    ]
  );
  return rows[0];
};

/**
 * Public repair booking. Only customer-supplied fields are stored (the schema
 * strips status/costs/notes) and only a minimal receipt is returned.
 *
 * @param {object} data - validated createTicketSchema body
 * @param {object} [user] - logged-in customer, if any (optionalAuth)
 */
const createTicket = async (data, user) => {
  return withTransaction(async (client) => {
    const branch = await resolveTicketBranch(client, data.branch_id);
    await assertActiveService(client, data.service_id);
    const ticket = await insertTicket(client, { ...data, branch_id: branch.id, customer_id: user?.id ?? null });
    return {
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      branch: { name: branch.name, phone: branch.phone },
    };
  });
};

/** Counter intake by staff (branch scoped). Links a registered customer by phone. */
const createWalkIn = async (data, user) => {
  const id = await withTransaction(async (client) => {
    const branch = await resolveTicketBranch(client, writeBranchScope(user, data.branch_id));
    await assertActiveService(client, data.service_id);
    // Link only accounts that verified this phone (see pos.service).
    const customer = await client.query(
      `SELECT id FROM users
        WHERE phone = $1 AND role = 'customer' AND phone_verified AND deleted_at IS NULL`,
      [data.customer_phone]
    );
    const ticket = await insertTicket(client, {
      ...data, branch_id: branch.id, customer_id: customer.rows[0]?.id ?? null,
    });
    await audit({
      actor: user, action: 'repair.create', entity: 'repair_ticket', entityId: ticket.id, db: client,
      data: { ticket_number: ticket.ticket_number, branch_id: branch.id, walk_in: true },
    });
    return ticket.id;
  });
  return getTicketById(id, user);
};

/**
 * Public tracking by ticket number + phone. Returns an explicit allowlist —
 * never internal notes, the device serial, or the customer's email.
 */
const trackRepair = async ({ ticket_number: ticketNumber, phone }) => {
  const { rows } = await query(
    `SELECT rt.ticket_number, rt.customer_name, rt.device_type, rt.device_brand, rt.device_model,
            rt.issue_description, rt.status, rt.assigned_technician, rt.estimated_cost, rt.final_cost,
            rt.diagnosis_notes, rt.customer_notes, rt.received_at, rt.estimated_completion,
            rt.completed_at, rt.delivered_at,
            rs.name AS service_name, b.name AS branch_name, b.phone AS branch_phone,
            ${PAID_SQL} AS paid_total
       FROM repair_tickets rt
       LEFT JOIN repair_services rs ON rs.id = rt.service_id
       LEFT JOIN branches b ON b.id = rt.branch_id
      WHERE rt.ticket_number = $1
        AND regexp_replace(regexp_replace(rt.customer_phone, '[^0-9]', '', 'g'), '^880', '0') = $2`,
    [ticketNumber, phone]
  );
  const t = rows[0];
  if (!t) throw ApiError.notFound(TRACK_NOT_FOUND);

  const paid = round2(t.paid_total);
  return {
    ticket_number: t.ticket_number,
    customer_name: t.customer_name,
    device_type: t.device_type,
    device_brand: t.device_brand,
    device_model: t.device_model,
    issue_description: t.issue_description,
    status: t.status,
    // Technician's display name (shown by the storefront); no contact details.
    assigned_technician: t.assigned_technician,
    estimated_cost: t.estimated_cost,
    final_cost: t.final_cost,
    diagnosis_notes: t.diagnosis_notes,
    customer_notes: t.customer_notes,
    received_at: t.received_at,
    estimated_completion: t.estimated_completion,
    completed_at: t.completed_at,
    delivered_at: t.delivered_at,
    service_name: t.service_name,
    branch_name: t.branch_name,
    branch_phone: t.branch_phone,
    paid_total: paid,
    balance_due: balanceDue(t.final_cost, paid),
  };
};

/** Staff ticket list (branch scoped, parameterized filters). */
const getAllTickets = async (q, user) => {
  const { page, limit, offset } = parsePagination(q);
  const where = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  const branchId = listBranchScope(user, q.branch_id);
  if (branchId) add('rt.branch_id = ?', branchId);
  if (q.status) add('rt.status = ?', q.status);
  if (q.priority) add('rt.priority = ?', q.priority);
  if (q.service_id) add('rt.service_id = ?', q.service_id);
  if (q.q) add('(rt.ticket_number ILIKE ? OR rt.customer_phone ILIKE ? OR rt.customer_name ILIKE ?)', `%${escapeLike(q.q)}%`);
  addDateRange(where, params, 'rt.received_at', q);
  const whereSql = where.join(' AND ');

  const [count, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM repair_tickets rt WHERE ${whereSql}`, params),
    query(
      `SELECT rt.id, rt.ticket_number, rt.customer_name, rt.customer_phone,
              rt.device_type, rt.device_brand, rt.device_model,
              rt.status, rt.priority, rt.assigned_technician,
              rt.estimated_cost, rt.final_cost, rt.received_at, rt.estimated_completion,
              rt.completed_at, rt.delivered_at,
              rt.service_id, rs.name AS service_name,
              rt.branch_id, b.name AS branch_name,
              ${PAID_SQL} AS paid_total
         FROM repair_tickets rt
         LEFT JOIN branches b ON b.id = rt.branch_id
         LEFT JOIN repair_services rs ON rs.id = rt.service_id
        WHERE ${whereSql}
        ORDER BY rt.received_at DESC, rt.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return paginatedResponse(rows.rows, count.rows[0].n, { page, limit });
};

/** Full ticket for staff, with payments and the balance. */
const getTicketById = async (id, user) => {
  const { rows } = await query(
    `SELECT rt.*, b.name AS branch_name, rs.name AS service_name
       FROM repair_tickets rt
       LEFT JOIN branches b ON b.id = rt.branch_id
       LEFT JOIN repair_services rs ON rs.id = rt.service_id
      WHERE rt.id = $1`,
    [id]
  );
  const ticket = rows[0];
  if (!ticket) throw ApiError.notFound(TICKET_NOT_FOUND);
  assertBranchAccess(user, ticket.branch_id, TICKET_NOT_FOUND);

  const payments = await query(
    `SELECT t.id, t.amount, t.payment_method, t.payment_status, t.notes, t.created_at,
            t.recorded_by, u.full_name AS recorded_by_name
       FROM repair_transactions t
       LEFT JOIN users u ON u.id = t.recorded_by
      WHERE t.ticket_id = $1
      ORDER BY t.created_at ASC`,
    [id]
  );
  const paid = round2(
    payments.rows.filter((p) => p.payment_status === 'completed').reduce((s, p) => s + Number(p.amount), 0)
  );
  return { ...ticket, payments: payments.rows, paid_total: paid, balance_due: balanceDue(ticket.final_cost, paid) };
};

const sumPaid = async (client, ticketId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM repair_transactions
      WHERE ticket_id = $1 AND payment_status = 'completed'`,
    [ticketId]
  );
  return round2(rows[0].paid);
};

// Columns staff may edit (fixed allowlist → safe to interpolate).
const TICKET_WRITABLE = [
  'status', 'priority', 'service_id', 'assigned_technician', 'estimated_cost', 'final_cost',
  'estimated_completion', 'diagnosis_notes', 'internal_notes', 'customer_notes', 'device_serial',
];
const PRE_READY = new Set(['pending', 'diagnosed', 'awaiting_parts', 'repairing']);

/**
 * Staff update (branch scoped). Status drives the timestamps: 'ready' sets
 * completed_at, 'delivered' sets delivered_at, moving back before 'ready'
 * clears them.
 */
const updateTicket = async (id, data, user) => {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM repair_tickets WHERE id = $1 FOR UPDATE', [id]);
    const ticket = rows[0];
    if (!ticket) throw ApiError.notFound(TICKET_NOT_FOUND);
    assertBranchAccess(user, ticket.branch_id, TICKET_NOT_FOUND);

    if (data.service_id) {
      const s = await client.query('SELECT 1 FROM repair_services WHERE id = $1', [data.service_id]);
      if (!s.rows.length) throw ApiError.badRequest('Repair service not found');
    }
    if (data.final_cost !== undefined && data.final_cost !== null) {
      const paid = await sumPaid(client, id);
      if (paid > data.final_cost + EPS) {
        throw ApiError.conflict(`Payments already received (৳${paid}) exceed this final cost`);
      }
    }

    const cols = TICKET_WRITABLE.filter((k) => data[k] !== undefined);
    const vals = cols.map((k) => data[k]);
    const sets = cols.map((k, i) => `${k} = $${i + 1}`);
    if (data.status === 'ready') sets.push('completed_at = COALESCE(completed_at, NOW())', 'delivered_at = NULL');
    if (data.status === 'delivered') {
      sets.push('completed_at = COALESCE(completed_at, NOW())', 'delivered_at = COALESCE(delivered_at, NOW())');
    }
    if (PRE_READY.has(data.status)) sets.push('completed_at = NULL', 'delivered_at = NULL');

    vals.push(id);
    await client.query(`UPDATE repair_tickets SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    await audit({
      actor: user, action: 'repair.update', entity: 'repair_ticket', entityId: id, db: client,
      data: { ...data, ...(data.status && { previous_status: ticket.status }) },
    });
  });
  return getTicketById(id, user);
};

/**
 * Record a completed repair payment (staff, branch scoped). Total paid can't
 * exceed final_cost once it is set.
 */
const addRepairPayment = async (ticketId, data, user) => {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM repair_tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    const ticket = rows[0];
    if (!ticket) throw ApiError.notFound(TICKET_NOT_FOUND);
    assertBranchAccess(user, ticket.branch_id, TICKET_NOT_FOUND);

    const paid = await sumPaid(client, ticketId);
    if (ticket.final_cost !== null) {
      const due = round2(Number(ticket.final_cost) - paid);
      if (data.amount > due + EPS) {
        throw ApiError.conflict(`Payment exceeds the balance due (৳${Math.max(due, 0)})`);
      }
    }

    const { rows: [payment] } = await client.query(
      `INSERT INTO repair_transactions (ticket_id, payment_method, amount, payment_status, notes, recorded_by)
       VALUES ($1, $2, $3, 'completed', $4, $5)
       RETURNING id, ticket_id, payment_method, amount, payment_status, notes, recorded_by, created_at`,
      [ticketId, data.payment_method, data.amount, data.notes ?? null, user.id]
    );
    await audit({
      actor: user, action: 'repair.payment', entity: 'repair_ticket', entityId: ticketId, db: client,
      data: { payment_id: payment.id, amount: data.amount, payment_method: data.payment_method },
    });
    const paidTotal = round2(paid + data.amount);
    return { payment, paid_total: paidTotal, balance_due: balanceDue(ticket.final_cost, paidTotal) };
  });
};

module.exports = {
  getServices,
  listServicesAdmin,
  createService,
  updateService,
  removeService,
  trackRepair,
  createTicket,
  createWalkIn,
  getAllTickets,
  getTicketById,
  updateTicket,
  addRepairPayment,
};
