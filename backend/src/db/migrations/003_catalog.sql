-- ============================================================
-- Migration 003 — catalog
--   * product warranty, used-laptop listing details, merchandising
--   * more product conditions (refurbished, open box)
--   * category / brand descriptions, SEO fields, banners
--   * media library for uploaded images
--   * single-primary-image invariant, sale window sanity
--   * indexes for the public listing queries
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- ─── Product conditions ─────────────────────────────────────
-- New enum values can't be used in the transaction that adds them; nothing
-- below references them.
ALTER TYPE product_condition ADD VALUE IF NOT EXISTS 'refurbished';
ALTER TYPE product_condition ADD VALUE IF NOT EXISTS 'open_box';

-- ─── Products ───────────────────────────────────────────────
ALTER TABLE products
    -- Warranty
    ADD COLUMN IF NOT EXISTS warranty_months INT
        CHECK (warranty_months IS NULL OR warranty_months BETWEEN 0 AND 120),
    ADD COLUMN IF NOT EXISTS warranty_type   VARCHAR(20)
        CHECK (warranty_type IS NULL OR warranty_type IN ('brand', 'shop', 'none')),
    ADD COLUMN IF NOT EXISTS warranty_notes  TEXT,
    -- Used-laptop listing details (per listing, not per serial unit)
    ADD COLUMN IF NOT EXISTS condition_grade VARCHAR(10),
    ADD COLUMN IF NOT EXISTS battery_health  SMALLINT
        CHECK (battery_health IS NULL OR battery_health BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS battery_cycles  INT
        CHECK (battery_cycles IS NULL OR battery_cycles >= 0),
    ADD COLUMN IF NOT EXISTS accessories     TEXT,
    -- Merchandising
    ADD COLUMN IF NOT EXISTS badge           VARCHAR(40),
    ADD COLUMN IF NOT EXISTS sort_order      INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS og_image_url    TEXT;

-- ─── Categories & brands ────────────────────────────────────
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS description      TEXT,
    ADD COLUMN IF NOT EXISTS meta_title       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_description TEXT,
    ADD COLUMN IF NOT EXISTS banner_url       TEXT;

ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS description      TEXT,
    ADD COLUMN IF NOT EXISTS meta_title       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_description TEXT,
    ADD COLUMN IF NOT EXISTS banner_url       TEXT,
    ADD COLUMN IF NOT EXISTS sort_order       INT NOT NULL DEFAULT 0;

-- ─── Media library (re-encoded uploads in object storage) ───
CREATE TABLE IF NOT EXISTS media (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key  TEXT UNIQUE NOT NULL,
    url          TEXT NOT NULL,
    content_type VARCHAR(60) NOT NULL,
    width        INT,
    height       INT,
    size_bytes   INT,
    alt_text     VARCHAR(255),
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_url     ON media (url);
CREATE INDEX IF NOT EXISTS idx_media_created ON media (created_at DESC);

-- ─── Product images: exactly one primary per product ────────
-- Clean up legacy data first so the unique index can be built: keep the
-- earliest primary, then give image-bearing products without one a primary.
UPDATE product_images pi
   SET is_primary = FALSE
 WHERE pi.is_primary
   AND pi.id <> (
       SELECT x.id FROM product_images x
        WHERE x.product_id = pi.product_id AND x.is_primary
        ORDER BY x.sort_order, x.created_at, x.id
        LIMIT 1);

UPDATE product_images pi
   SET is_primary = TRUE
 WHERE pi.id IN (
       SELECT DISTINCT ON (x.product_id) x.id
         FROM product_images x
        WHERE NOT EXISTS (SELECT 1 FROM product_images y
                           WHERE y.product_id = x.product_id AND y.is_primary)
        ORDER BY x.product_id, x.sort_order, x.created_at, x.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_primary
    ON product_images (product_id) WHERE is_primary;
-- "Is this upload still used?" checks before deleting media.
CREATE INDEX IF NOT EXISTS idx_product_images_url ON product_images (image_url);

-- ─── Variants: a sale window must end after it starts ───────
-- NOT VALID: enforced for new writes without failing on legacy rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variant_sale_window') THEN
        ALTER TABLE product_variants
            ADD CONSTRAINT chk_variant_sale_window
            CHECK (sale_starts_at IS NULL OR sale_ends_at IS NULL OR sale_ends_at > sale_starts_at)
            NOT VALID;
    END IF;
END $$;

-- ─── Indexes for listing / admin queries ────────────────────
CREATE INDEX IF NOT EXISTS idx_products_public_created
    ON products (created_at DESC) WHERE is_active AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_featured_sort
    ON products (sort_order, created_at DESC) WHERE is_featured AND is_active AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_variants_product_active
    ON product_variants (product_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories (sort_order, name);
CREATE INDEX IF NOT EXISTS idx_brands_sort     ON brands (sort_order, name);
-- Variant delete checks whether any order line references the variant.
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items (variant_id);

-- ============================================================
-- End of migration 003
-- ============================================================
