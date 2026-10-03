-- ============================================================
-- Migration 009 — spec templates & banners (Phase 2)
--   * categories.spec_template: grouped spec fields; a category without
--     one inherits the nearest ancestor's
--   * product_specifications: group_name / field_key / is_highlight
--   * banners: admin-curated homepage hero slides and promo slots
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- ─── Category spec templates ────────────────────────────────
-- The API validates the full shape (modules/categories/spec-template.js);
-- the database only guarantees it is a { "groups": [...] } object.
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS spec_template JSONB;

-- ─── Product specifications: template link ──────────────────
-- field_key is NULL for custom rows. group_name / is_highlight are copied
-- from the template field when a spec is saved (and re-synced when the
-- template or the product's category changes).
ALTER TABLE product_specifications
    ADD COLUMN IF NOT EXISTS group_name   VARCHAR(80),
    ADD COLUMN IF NOT EXISTS field_key    VARCHAR(40),
    ADD COLUMN IF NOT EXISTS is_highlight BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Banners ────────────────────────────────────────────────
-- A slide either promotes a product (title/image/price resolved live from
-- the product) or is a custom image slide.
CREATE TABLE IF NOT EXISTS banners (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement        VARCHAR(10) NOT NULL DEFAULT 'hero',
    product_id       UUID REFERENCES products(id) ON DELETE CASCADE,
    title            VARCHAR(120),
    subtitle         VARCHAR(200),
    badge            VARCHAR(30),
    image_url        TEXT,
    mobile_image_url TEXT,
    cta_label        VARCHAR(40),
    link_url         TEXT,
    sort_order       INT NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at        TIMESTAMPTZ,
    ends_at          TIMESTAMPTZ,
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON banners;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON banners
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Constraints (added only if missing) ────────────────────
-- Defence in depth behind the Zod schemas: a link must be a site path
-- ("/x", never "//host" or "/\host", which browsers treat as another
-- origin) or an http(s) URL; images must be http(s).
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT * FROM (VALUES
            ('categories', 'chk_categories_spec_template',
             $c$CHECK (spec_template IS NULL OR (jsonb_typeof(spec_template) = 'object'
                       AND jsonb_typeof(spec_template -> 'groups') = 'array'))$c$),
            ('product_specifications', 'chk_product_specs_field_key',
             $c$CHECK (field_key IS NULL OR field_key ~ '^[a-z0-9_]{1,40}$')$c$),
            ('banners', 'chk_banners_placement',
             $c$CHECK (placement IN ('hero', 'promo'))$c$),
            ('banners', 'chk_banners_source',
             $c$CHECK (product_id IS NOT NULL OR image_url IS NOT NULL)$c$),
            ('banners', 'chk_banners_window',
             $c$CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)$c$),
            ('banners', 'chk_banners_image_url',
             $c$CHECK (image_url IS NULL OR (char_length(image_url) <= 2048 AND image_url ~* '^https?://'))$c$),
            ('banners', 'chk_banners_mobile_image_url',
             $c$CHECK (mobile_image_url IS NULL
                       OR (char_length(mobile_image_url) <= 2048 AND mobile_image_url ~* '^https?://'))$c$),
            ('banners', 'chk_banners_link_url',
             $c$CHECK (link_url IS NULL OR (char_length(link_url) <= 2048
                       AND (link_url ~ '^/([^/\\]|$)' OR link_url ~* '^https?://')))$c$),
            ('banners', 'chk_banners_text',
             $c$CHECK (char_length(btrim(COALESCE(title, 'x'))) > 0
                       AND char_length(btrim(COALESCE(cta_label, 'x'))) > 0)$c$)
        ) AS t(tbl, name, def)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
        END IF;
    END LOOP;
END $$;

-- ─── Indexes ────────────────────────────────────────────────
-- One value per template field per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_specs_field
    ON product_specifications (product_id, field_key) WHERE field_key IS NOT NULL;
-- Card highlights: lists fetch up to 4 per product in one query.
CREATE INDEX IF NOT EXISTS idx_product_specs_highlight
    ON product_specifications (product_id, sort_order) WHERE is_highlight;
-- Future listing filters (field = value). spec_value may be 2000 chars of
-- Bangla (~6 KB), beyond a btree entry's limit, so only a prefix is indexed;
-- filters must compare LEFT(spec_value, 200) to use it.
CREATE INDEX IF NOT EXISTS idx_product_specs_field_value
    ON product_specifications (field_key, LEFT(spec_value, 200)) WHERE field_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_banners_placement
    ON banners (placement, is_active, sort_order);
-- ON DELETE CASCADE from products, and "is this product on a banner?".
CREATE INDEX IF NOT EXISTS idx_banners_product ON banners (product_id) WHERE product_id IS NOT NULL;

-- ============================================================
-- End of migration 009
-- ============================================================
