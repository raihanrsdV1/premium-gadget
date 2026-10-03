/**
 * Single source of truth for "what does this variant cost right now".
 *
 * A variant may carry a scheduled sale price (sale_price + optional
 * sale_starts_at / sale_ends_at). Listing, product detail, checkout and POS
 * must all use the same expression so the price a customer sees is the price
 * they're charged.
 *
 * @param {string} alias - SQL alias of the product_variants table (default "pv")
 * @returns {string} SQL expression yielding the effective unit price
 */
const effectivePriceSql = (alias = 'pv') => `(
  CASE
    WHEN ${alias}.sale_price IS NOT NULL
     AND (${alias}.sale_starts_at IS NULL OR ${alias}.sale_starts_at <= NOW())
     AND (${alias}.sale_ends_at   IS NULL OR ${alias}.sale_ends_at   >  NOW())
    THEN ${alias}.sale_price
    ELSE ${alias}.price
  END
)`;

/**
 * The "was" price shown struck through: the regular price while a sale is
 * live, otherwise compare_at_price (if any).
 */
const compareAtPriceSql = (alias = 'pv') => `(
  CASE
    WHEN ${alias}.sale_price IS NOT NULL
     AND (${alias}.sale_starts_at IS NULL OR ${alias}.sale_starts_at <= NOW())
     AND (${alias}.sale_ends_at   IS NULL OR ${alias}.sale_ends_at   >  NOW())
    THEN GREATEST(${alias}.price, COALESCE(${alias}.compare_at_price, ${alias}.price))
    ELSE ${alias}.compare_at_price
  END
)`;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

module.exports = { effectivePriceSql, compareAtPriceSql, round2 };
