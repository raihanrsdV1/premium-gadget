-- ============================================================
-- Migration 002 — security hardening + shared foundation
--   * session revocation (token_version), OTP attempt tracking
--   * payment idempotency (unique gateway validation ids)
--   * stock integrity (reserved <= quantity)
--   * collision-free order / ticket numbers (sequences)
--   * coupon caps + per-user redemption tracking
--   * scheduled sale prices on variants
--   * order payment fields, order-line list price + branch
--   * admin audit log
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- ─── Users / auth ───────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version       INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_at       TIMESTAMPTZ;

-- OTPs are stored as SHA-256 hashes (64 hex chars), never in plaintext.
ALTER TABLE otp_codes
    ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
    ALTER COLUMN code TYPE VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose_created
    ON otp_codes (phone, purpose, created_at DESC);

-- ─── Payments: a gateway validation id can confirm at most one payment,
--     and an order can have at most one completed gateway payment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_ssl_validation_id
    ON transactions (ssl_validation_id)
    WHERE ssl_validation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_order_completed_gateway
    ON transactions (order_id)
    WHERE payment_status = 'completed' AND ssl_validation_id IS NOT NULL;

-- ─── Stock integrity ────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_reserved_le_quantity') THEN
        ALTER TABLE inventory
            ADD CONSTRAINT chk_inventory_reserved_le_quantity CHECK (reserved <= quantity);
    END IF;
END $$;

-- ─── Document number sequences ──────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq  START 1001;
CREATE SEQUENCE IF NOT EXISTS repair_ticket_seq START 1001;

-- ─── Coupons ────────────────────────────────────────────────
ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS max_discount   DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS per_user_limit INT,
    ADD COLUMN IF NOT EXISTS channel        VARCHAR(10) NOT NULL DEFAULT 'all'
        CHECK (channel IN ('all', 'online', 'pos'));
-- Codes are matched case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_code_lower ON coupons (LOWER(code));

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id   UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    discount    DECIMAL(12,2) NOT NULL,
    released_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (coupon_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_user
    ON coupon_redemptions (coupon_id, user_id) WHERE released_at IS NULL;

-- ─── Scheduled sale prices ──────────────────────────────────
ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS sale_price     DECIMAL(12,2) CHECK (sale_price IS NULL OR sale_price > 0),
    ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sale_ends_at   TIMESTAMPTZ;

-- ─── Orders: payment fields shared by online checkout, COD and POS ─────
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'cod';

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_method payment_method,
    ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'pending';

-- Order lines: the catalog price at sale time (unit_price may differ after
-- an authorised POS override) and the branch the stock came from.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS list_price DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS branch_id  UUID REFERENCES branches(id);

-- ─── Admin audit log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES users(id),
    action      VARCHAR(60)  NOT NULL,
    entity      VARCHAR(60)  NOT NULL,
    entity_id   UUID,
    data        JSONB,
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON admin_audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at DESC);

-- ============================================================
-- End of migration 002
-- ============================================================
