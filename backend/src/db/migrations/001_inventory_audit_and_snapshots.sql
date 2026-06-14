-- ============================================================
-- Migration 001 — Inventory units, stock ledger, order snapshots,
--                 coupon link, updated_at triggers, fuzzy search
-- ============================================================
-- ADDITIVE ONLY. Safe to run against a live database.
-- Every statement is idempotent (IF NOT EXISTS / DROP+CREATE for
-- triggers), so re-running this migration is a no-op.
--
-- Run against the running container:
--   docker exec -i pg_premium_gadget \
--     psql -U premium_gadget -d premium_gadget \
--     < backend/src/db/migrations/001_inventory_audit_and_snapshots.sql
-- ============================================================
-- NOTE: transaction is managed by the migration runner (scripts/migrate.js);
-- this file contains plain statements only.

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy / trigram search

-- ─── inventory_units (serialized stock for used items) ───────
CREATE TABLE IF NOT EXISTS inventory_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    serial_number   VARCHAR(120),
    condition_grade VARCHAR(20),
    battery_health  SMALLINT,
    cosmetic_notes  TEXT,
    cost_price      DECIMAL(12,2),
    listed_price    DECIMAL(12,2),
    status          VARCHAR(20) NOT NULL DEFAULT 'in_stock',
    order_item_id   UUID REFERENCES order_items(id),
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sold_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inventory_units_variant_branch
    ON inventory_units (variant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_status
    ON inventory_units (status);

-- ─── stock_movements (audit ledger) ─────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id     UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    unit_id        UUID REFERENCES inventory_units(id),
    movement_type  VARCHAR(20) NOT NULL,
    quantity_delta INT NOT NULL,
    reference_type VARCHAR(20),
    reference_id   UUID,
    performed_by   UUID REFERENCES users(id),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_branch
    ON stock_movements (variant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at
    ON stock_movements (created_at);

-- ─── Additive columns on existing tables ────────────────────
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS reserved INT NOT NULL DEFAULT 0 CHECK (reserved >= 0);

ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2);

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN NOT NULL DEFAULT FALSE;

-- Order-line snapshot fields (nullable; existing rows unaffected)
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS variant_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sku          VARCHAR(60);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id);

-- ─── Reusable updated_at trigger function ───────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach a BEFORE UPDATE trigger to every table that has an
-- updated_at column. DROP IF EXISTS + CREATE keeps this idempotent
-- and only ever leaves a single trigger per table.
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'branches', 'users', 'addresses', 'categories', 'brands',
        'products', 'product_variants', 'inventory', 'orders',
        'transactions', 'repair_services', 'repair_tickets',
        'repair_transactions', 'reviews', 'coupons'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;', tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_set_updated_at
               BEFORE UPDATE ON %I
               FOR EACH ROW EXECUTE FUNCTION set_updated_at();', tbl);
    END LOOP;
END;
$$;

-- ─── Fuzzy product-name search ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING gin (name gin_trgm_ops);

-- ============================================================
-- End of migration 001
-- ============================================================
