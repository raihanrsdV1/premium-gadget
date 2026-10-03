-- ============================================================
-- Migration 004 — commerce: checkout snapshots, order lifecycle,
--                 status history, manual payments, site settings
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- ─── Orders: shipping snapshot + fulfilment fields ──────────
-- shipping_address is the address as entered at checkout (the address book
-- entry may change later). shipping_method is a settings zone code.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_address JSONB,
    ADD COLUMN IF NOT EXISTS shipping_method  VARCHAR(40),
    ADD COLUMN IF NOT EXISTS tracking_number  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS courier          VARCHAR(60),
    ADD COLUMN IF NOT EXISTS confirmed_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS shipped_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
    -- Why a cancelled order was cancelled: failed / cancelled / expired / staff.
    ADD COLUMN IF NOT EXISTS cancel_reason    VARCHAR(30);

-- Reservation-expiry job scan: unpaid pending online orders by age.
CREATE INDEX IF NOT EXISTS idx_orders_pending_unpaid
    ON orders (created_at)
    WHERE status = 'pending' AND channel = 'online' AND payment_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items (variant_id);

-- ─── Order status history (every transition) ────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status   order_status NOT NULL,
    note        TEXT,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order
    ON order_status_history (order_id, created_at);

-- ─── Transactions: manual (staff-recorded) payments ─────────
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS note        TEXT,
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ─── Site settings (key → JSON value) ───────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
    key         VARCHAR(60) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON site_settings;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Defaults (the owner edits these from the admin app). Kept in sync with
-- DEFAULTS in modules/settings/settings.service.js, which also serves them
-- when a row is missing.
INSERT INTO site_settings (key, value) VALUES
  ('store', '{
     "name": "Premium Gadget",
     "phone": "01886670543",
     "whatsapp": "01886670543",
     "email": null,
     "address": "Shop 451, Level 4, Sanmar Ocean City, Chattogram 4203, Bangladesh",
     "hours": null,
     "map_url": null
   }'::jsonb),
  ('social', '{ "facebook": null, "instagram": null, "youtube": null, "tiktok": null }'::jsonb),
  ('shipping', '{
     "zones": [
       { "code": "inside_dhaka",  "label": "Inside Dhaka",  "fee": 100, "eta": "1-2 days",
         "districts": ["Dhaka"], "divisions": [], "is_default": false },
       { "code": "outside_dhaka", "label": "Outside Dhaka", "fee": 200, "eta": "2-4 days",
         "districts": [], "divisions": [], "is_default": true }
     ],
     "free_shipping_threshold": null
   }'::jsonb),
  ('checkout', '{ "cod_enabled": true, "cod_requires_verified_phone": false, "reservation_minutes": 30, "pending_order_limit": 3,
                  "cod_confirm_hours": 24, "max_units_per_order": 5, "cod_max_order_value": 300000 }'::jsonb),
  ('seo', '{
     "default_title": "Premium Gadget — New & Used Laptops in Bangladesh",
     "default_description": "Premium Gadget in Chattogram sells quality new and used laptops and gadgets with warranty, plus expert repairs. Cash on delivery and secure online payment across Bangladesh.",
     "og_image": null
   }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- End of migration 004
-- ============================================================
