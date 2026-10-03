/**
 * Human-readable, collision-free document numbers backed by Postgres
 * sequences (see migration 002). The date part uses Asia/Dhaka time.
 *
 *   PG-20261003-000123   (orders, online + POS)
 *   RPR-20261003-000045  (repair tickets)
 *
 * The numeric part is a global sequence, so numbers never repeat even across
 * days. Pass the transaction client when inside withTransaction.
 *
 * @param {{ query: Function }} db - pool or transaction client
 * @returns {Promise<string>}
 */
const nextNumber = async (db, prefix, sequence) => {
  const { rows } = await db.query(
    `SELECT to_char(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD') AS d,
            lpad(nextval('${sequence}')::text, 6, '0') AS n`
  );
  return `${prefix}-${rows[0].d}-${rows[0].n}`;
};

const generateOrderNumber = (db) => nextNumber(db, 'PG', 'order_number_seq');

const generateTicketNumber = (db) => nextNumber(db, 'RPR', 'repair_ticket_seq');

module.exports = { generateOrderNumber, generateTicketNumber };
