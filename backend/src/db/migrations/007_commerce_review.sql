-- ============================================================
-- Migration 007 — commerce fixes from the pre-launch security review
--   * orders.system_note: append-only flags written by the system (refund
--     required, duplicate payment, gateway mismatch). No API edits it, so a
--     staff member can't erase a "refund required" flag.
--   * settings upgrade for databases seeded by an earlier 004: new checkout
--     limits, and address-mapped shipping zones.
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS system_note TEXT;

-- New checkout keys; values the owner already saved win (right side of ||).
UPDATE site_settings
   SET value = '{ "cod_confirm_hours": 24, "max_units_per_order": 5, "cod_max_order_value": 300000 }'::jsonb || value
 WHERE key = 'checkout'
   AND NOT (value ?& ARRAY['cod_confirm_hours', 'max_units_per_order', 'cod_max_order_value']);

-- Shipping zones now map to the address. Replace the original seed only if
-- the owner never edited it.
UPDATE site_settings
   SET value = '{
     "zones": [
       { "code": "inside_dhaka",  "label": "Inside Dhaka",  "fee": 100, "eta": "1-2 days",
         "districts": ["Dhaka"], "divisions": [], "is_default": false },
       { "code": "outside_dhaka", "label": "Outside Dhaka", "fee": 200, "eta": "2-4 days",
         "districts": [], "divisions": [], "is_default": true }
     ],
     "free_shipping_threshold": null
   }'::jsonb
 WHERE key = 'shipping'
   AND value = '{
     "zones": [
       { "code": "inside_dhaka",  "label": "Inside Dhaka",  "fee": 100, "eta": "1-2 days" },
       { "code": "outside_dhaka", "label": "Outside Dhaka", "fee": 200, "eta": "2-4 days" }
     ],
     "free_shipping_threshold": null
   }'::jsonb;

-- ============================================================
-- End of migration 007
-- ============================================================
