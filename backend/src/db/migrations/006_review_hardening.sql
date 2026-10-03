-- ============================================================
-- Migration 006 — integrity guards from the pre-launch security review
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

-- A category can never be its own parent (deeper cycles are prevented in
-- category.service, which serialises re-parenting).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_categories_not_own_parent') THEN
        UPDATE categories SET parent_id = NULL WHERE parent_id = id;
        ALTER TABLE categories
            ADD CONSTRAINT chk_categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
    END IF;
END $$;

-- ─── Money / counter sanity (defence in depth behind the app's validation) ──
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN SELECT * FROM (VALUES
        ('orders',       'chk_orders_amounts_nonneg',     'subtotal >= 0 AND shipping_fee >= 0 AND total_amount >= 0'),
        ('orders',       'chk_orders_discount_range',     'discount >= 0 AND discount <= subtotal'),
        ('order_items',  'chk_order_items_prices_nonneg', 'unit_price >= 0 AND total_price >= 0'),
        ('transactions', 'chk_transactions_amount_nonneg','amount >= 0'),
        ('coupons',      'chk_coupons_value_positive',    'discount_value > 0'),
        ('coupons',      'chk_coupons_percentage_max',    'discount_type <> ''percentage'' OR discount_value <= 100'),
        ('coupons',      'chk_coupons_counters',          'used_count >= 0 AND (max_uses IS NULL OR max_uses >= 1) AND (per_user_limit IS NULL OR per_user_limit >= 1)'),
        ('coupons',      'chk_coupons_caps',              '(max_discount IS NULL OR max_discount > 0) AND COALESCE(min_order_value, 0) >= 0'),
        ('coupons',      'chk_coupons_window',            'valid_until > valid_from')
    ) AS t(tbl, name, expr)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', c.tbl, c.name, c.expr);
        END IF;
    END LOOP;
END $$;
