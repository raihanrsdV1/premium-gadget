-- ============================================================
-- Migration 010 — collections (Phase 3)
--   * collections: admin-curated or auto-filled product groups
--     ("Hot sale", "New arrivals", "Trending", …) with an optional card
--     badge and a home-page slot
--   * collection_products: ordered membership of manual collections
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

CREATE TABLE IF NOT EXISTS collections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(80)  NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    badge_label     VARCHAR(24),
    badge_tone      VARCHAR(12)  NOT NULL DEFAULT 'coral',
    source          VARCHAR(16)  NOT NULL DEFAULT 'manual',
    source_days     INT,
    show_on_home    BOOLEAN      NOT NULL DEFAULT FALSE,
    home_sort_order INT          NOT NULL DEFAULT 0,
    home_limit      INT          NOT NULL DEFAULT 10,
    home_layout     VARCHAR(12)  NOT NULL DEFAULT 'carousel',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    banner_url      TEXT,
    meta_title      VARCHAR(120),
    meta_description VARCHAR(320),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_products (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
    sort_order    INT  NOT NULL DEFAULT 0,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_products_product ON collection_products (product_id);

DROP TRIGGER IF EXISTS trg_set_updated_at ON collections;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Constraints (added only if missing) ────────────────────
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT * FROM (VALUES
            ('collections', 'chk_collections_badge_tone',
             $c$CHECK (badge_tone IN ('coral', 'blue', 'navy', 'green', 'amber'))$c$),
            ('collections', 'chk_collections_source',
             $c$CHECK (source IN ('manual', 'newest', 'on_sale', 'best_selling', 'featured'))$c$),
            ('collections', 'chk_collections_source_days',
             $c$CHECK (source_days IS NULL OR source_days BETWEEN 1 AND 365)$c$),
            ('collections', 'chk_collections_home_limit',
             $c$CHECK (home_limit BETWEEN 1 AND 24)$c$),
            ('collections', 'chk_collections_home_layout',
             $c$CHECK (home_layout IN ('carousel', 'grid', 'countdown'))$c$),
            ('collections', 'chk_collections_window',
             $c$CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)$c$),
            ('collections', 'chk_collections_name',
             $c$CHECK (char_length(btrim(name)) > 0)$c$)
        ) AS t(tbl, name, def)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
        END IF;
    END LOOP;
END $$;

-- Live-collection lookups (badges, home page) and the home ordering.
CREATE INDEX IF NOT EXISTS idx_collections_home
    ON collections (home_sort_order) WHERE is_active;

-- ─── Default collections ────────────────────────────────────
INSERT INTO collections
    (name, slug, source, source_days, badge_label, badge_tone, home_layout, show_on_home, home_sort_order, description)
VALUES
    ('Hot Sale',     'hot-sale',     'manual',       NULL, 'Hot',        'coral', 'carousel', TRUE, 0, 'Hand-picked hot deals.'),
    ('New Arrivals', 'new-arrivals', 'newest',       30,   'Just in',    'blue',  'carousel', TRUE, 1, 'Fresh in the last 30 days.'),
    ('Trending',     'trending',     'manual',       NULL, 'Trending',   'amber', 'carousel', TRUE, 2, 'What shoppers are eyeing right now.'),
    ('Best Sellers', 'best-sellers', 'best_selling', 30,   'Top selling','green', 'grid',     TRUE, 3, 'Most bought in the last 30 days.'),
    ('Deals',        'deals',        'on_sale',      NULL, NULL,         'coral', 'grid',     TRUE, 4, 'Everything currently on sale.')
ON CONFLICT (slug) DO NOTHING;

-- ─── Announcement bar setting (default: off) ────────────────
-- Kept in sync with DEFAULTS in modules/settings/settings.service.js.
INSERT INTO site_settings (key, value) VALUES
  ('announcement', '{"enabled": false, "items": []}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- End of migration 010
-- ============================================================
