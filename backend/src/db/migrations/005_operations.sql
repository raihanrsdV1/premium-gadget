-- ============================================================
-- Migration 005 — operations: branches, inventory serial registry,
--                 POS, repairs, reviews
--   * branch contact/display fields
--   * serial registry tidy-up (status/battery checks, unique serial)
--   * POS customer + void fields on orders
--   * repair customer-visible notes, payment recorder
--   * review verification + moderation, one review per user/product
--   * indexes for the staff list/filter endpoints
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- ─── Branches ───────────────────────────────────────────────
ALTER TABLE branches
    ADD COLUMN IF NOT EXISTS whatsapp      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS opening_hours VARCHAR(255),
    ADD COLUMN IF NOT EXISTS map_url       TEXT,
    ADD COLUMN IF NOT EXISTS sort_order    INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_branches_active_sort
    ON branches (sort_order, created_at) WHERE is_active;

-- ─── Serial registry (inventory_units) ──────────────────────
-- Units only record serial numbers / condition of used laptops. Sellable
-- availability always comes from the fungible inventory row. 'reserved' is
-- kept for the legacy online-checkout path that tagged units directly.
ALTER TABLE inventory_units
    ADD COLUMN IF NOT EXISTS notes      TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_units_status') THEN
        ALTER TABLE inventory_units ADD CONSTRAINT chk_inventory_units_status
            CHECK (status IN ('in_stock', 'reserved', 'sold', 'returned', 'written_off'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_units_battery') THEN
        ALTER TABLE inventory_units ADD CONSTRAINT chk_inventory_units_battery
            CHECK (battery_health IS NULL OR battery_health BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_units_prices') THEN
        ALTER TABLE inventory_units ADD CONSTRAINT chk_inventory_units_prices
            CHECK ((cost_price IS NULL OR cost_price >= 0) AND (listed_price IS NULL OR listed_price >= 0));
    END IF;
END $$;

-- A serial number identifies one physical unit of a variant (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_units_variant_serial
    ON inventory_units (variant_id, LOWER(serial_number))
    WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_units_order_item
    ON inventory_units (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_units_branch_status
    ON inventory_units (branch_id, status);

DROP TRIGGER IF EXISTS trg_set_updated_at ON inventory_units;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON inventory_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Stock ledger ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_created
    ON stock_movements (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
    ON stock_movements (reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_unit
    ON stock_movements (unit_id) WHERE unit_id IS NOT NULL;

-- ─── POS orders ─────────────────────────────────────────────
-- Walk-in customer details (orders.user_id is linked when the phone matches
-- a registered customer) and void bookkeeping.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS void_reason   TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_pos_branch_created
    ON orders (branch_id, created_at DESC) WHERE channel = 'pos';
CREATE INDEX IF NOT EXISTS idx_orders_pos_operator
    ON orders (pos_operator_id) WHERE pos_operator_id IS NOT NULL;

-- ─── Repairs ────────────────────────────────────────────────
-- customer_notes is shown on the public tracking page; internal_notes never is.
ALTER TABLE repair_tickets
    ADD COLUMN IF NOT EXISTS customer_notes TEXT;
CREATE INDEX IF NOT EXISTS idx_repair_tickets_branch_received
    ON repair_tickets (branch_id, received_at DESC);

ALTER TABLE repair_transactions
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id) ON DELETE SET NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_repair_transactions_amount') THEN
        ALTER TABLE repair_transactions ADD CONSTRAINT chk_repair_transactions_amount
            CHECK (amount > 0);
    END IF;
END $$;

-- ─── Reviews ────────────────────────────────────────────────
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS moderated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at      TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_user_product
    ON reviews (user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_approved
    ON reviews (product_id, created_at DESC) WHERE is_approved;
CREATE INDEX IF NOT EXISTS idx_reviews_pending
    ON reviews (created_at DESC) WHERE NOT is_approved;

-- ============================================================
-- End of migration 005
-- ============================================================
