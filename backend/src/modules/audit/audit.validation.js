const { z, uuid, queryInt } = require('../../utils/validators');

const opt = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const label = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_.:-]+$/, 'Invalid value');

// "2026-03-01" or a full ISO date-time.
const isoDay = z
  .string()
  .trim()
  .max(40)
  .regex(/^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'Must be an ISO date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Must be an ISO date');

const listQuery = z.object({
  page: opt(queryInt(1)),
  limit: opt(queryInt(1, 100)),
  actor_id: opt(uuid),
  action: opt(label),
  entity: opt(label),
  entity_id: opt(uuid),
  from: opt(isoDay),
  to: opt(isoDay),
});

module.exports = { listQuery, isoDay };
