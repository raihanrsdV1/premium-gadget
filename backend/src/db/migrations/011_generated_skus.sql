-- SKUs are assigned by the system: PG-10001, PG-10002, ... (owner's decision,
-- 2026-10-04). Staff never type them. A sequence keeps them unique without a
-- lookup; the PG-<digits> pattern is reserved for it (the API rejects it as a
-- manual SKU, so imports can't collide with a future value). Existing SKUs are
-- left as they are.
CREATE SEQUENCE IF NOT EXISTS product_variant_sku_seq START WITH 10001;

ALTER TABLE product_variants
  ALTER COLUMN sku SET DEFAULT ('PG-' || nextval('product_variant_sku_seq')::text);
