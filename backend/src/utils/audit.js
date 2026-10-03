const { query } = require('../config/database');
const { currentContext } = require('./requestContext');

/**
 * Record an admin action in admin_audit_log. Call after any staff write
 * (create/update/delete, status changes, price overrides, stock adjustments).
 *
 * Never throws: auditing must not break the action it records. Pass the
 * transaction client when you want the entry committed atomically with the
 * change.
 *
 * @param {object} p
 * @param {{ id: string }} p.actor         - req.user
 * @param {string} p.action               - e.g. 'product.create', 'order.status'
 * @param {string} p.entity               - e.g. 'product', 'order'
 * @param {string} [p.entityId]
 * @param {object} [p.data]               - small JSON diff/context (no secrets)
 * @param {string} [p.ip]
 * @param {{ query: Function }} [p.db]    - transaction client (optional)
 */
const audit = async ({ actor, action, entity, entityId = null, data = null, ip = null, db = null }) => {
  try {
    await (db || { query }).query(
      `INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, data, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor?.id || null, action, entity, entityId, data ? JSON.stringify(data) : null, ip ?? currentContext().ip ?? null]
    );
  } catch (err) {
    if (db) throw err; // inside a transaction a failed insert aborts it anyway
    console.error('⚠️  audit log write failed:', err.message);
  }
};

module.exports = { audit };
