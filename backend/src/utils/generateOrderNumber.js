/**
 * Generate a human-readable order number.
 * Format: PG-YYYYMMDD-NNNN (random 4 digits)
 * @returns {string}
 */
const generateOrderNumber = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PG-${date}-${rand}`;
};

/**
 * Generate a human-readable repair ticket number.
 * Format: RPR-YYYYMMDD-NNNN
 * @returns {string}
 */
const generateTicketNumber = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RPR-${date}-${rand}`;
};

module.exports = { generateOrderNumber, generateTicketNumber };
