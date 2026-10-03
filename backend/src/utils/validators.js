const { z } = require('zod');

/**
 * Reusable Zod building blocks. Use these instead of re-declaring regexes so
 * every module accepts the same formats.
 */

/**
 * UUID, normalised to lower case. Postgres treats UUIDs case-insensitively but
 * JS string comparisons don't, so ownership / "not yourself" / cycle checks
 * that compare against DB ids (always lower-case) could otherwise be dodged
 * with an upper-case copy of the same id.
 */
const uuid = z.string().uuid('Invalid id').transform((v) => v.toLowerCase());

/** `{ id }` route params. */
const idParams = z.object({ id: uuid });

/**
 * Bangladesh mobile number. Accepts 01XXXXXXXXX, +8801XXXXXXXXX, 8801XXXXXXXXX,
 * with spaces/dashes, and normalizes to 01XXXXXXXXX.
 */
const bdPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?880/, '0'))
  .refine((v) => /^01[3-9]\d{8}$/.test(v), 'Invalid Bangladesh phone number');

/** Money in BDT: non-negative, max 2 decimals, below 100 crore. */
const money = z
  .number({ invalid_type_error: 'Must be a number' })
  .nonnegative()
  .max(999999999)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places');

const positiveMoney = money.refine((v) => v > 0, 'Must be greater than 0');

/** URL-safe slug. */
const slug = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may contain lowercase letters, numbers and hyphens');

/** http(s) URL only — blocks javascript:, data: etc. */
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL');

/** Optional nullable helper: accepts undefined, null, or the schema. */
const nullable = (schema) => schema.nullable().optional();

/** Query-string boolean: "true"/"1" → true, "false"/"0" → false. */
const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/** Query-string integer. Arrays (?page=1&page=2) are rejected as invalid. */
const queryInt = (min = 1, max = 1000000) => z.coerce.number().int().min(min).max(max);

/** Standard pagination query fields; spread into list query schemas. */
const paginationQuery = {
  page: queryInt(1).optional(),
  limit: queryInt(1, 100).optional(),
};

/** Free-text search term from a query string. */
const searchTerm = z.string().trim().max(100);

/** Escape LIKE/ILIKE wildcards so user input matches literally. */
const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

module.exports = {
  z,
  uuid,
  idParams,
  bdPhone,
  money,
  positiveMoney,
  slug,
  httpUrl,
  nullable,
  queryBool,
  queryInt,
  paginationQuery,
  searchTerm,
  escapeLike,
};
