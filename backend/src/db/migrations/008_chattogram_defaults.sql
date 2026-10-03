-- ============================================================
-- Migration 008 — store defaults for a Chattogram shop
--   * delivery zones: Inside / Outside Chattogram (was Inside / Outside Dhaka)
--   * Facebook page, and the GEC branch address as the store address
-- Each row is changed ONLY if it still holds the earlier default, so
-- anything the owner already edited in the admin app is kept.
-- Idempotent; plain statements (the runner owns the transaction).
-- ============================================================

UPDATE site_settings
   SET value = '{
     "zones": [
       { "code": "inside_chattogram",  "label": "Inside Chattogram",  "fee": 100, "eta": "1-2 days",
         "districts": ["Chattogram"], "divisions": [], "is_default": false },
       { "code": "outside_chattogram", "label": "Outside Chattogram", "fee": 200, "eta": "2-4 days",
         "districts": [], "divisions": [], "is_default": true }
     ],
     "free_shipping_threshold": null
   }'::jsonb
 WHERE key = 'shipping'
   AND value = '{
     "zones": [
       { "code": "inside_dhaka",  "label": "Inside Dhaka",  "fee": 100, "eta": "1-2 days",
         "districts": ["Dhaka"], "divisions": [], "is_default": false },
       { "code": "outside_dhaka", "label": "Outside Dhaka", "fee": 200, "eta": "2-4 days",
         "districts": [], "divisions": [], "is_default": true }
     ],
     "free_shipping_threshold": null
   }'::jsonb;

UPDATE site_settings
   SET value = jsonb_set(value, '{facebook}', '"https://www.facebook.com/premiumgadget.official/"')
 WHERE key = 'social' AND (value->'facebook' IS NULL OR value->'facebook' = 'null'::jsonb);

UPDATE site_settings
   SET value = jsonb_set(value, '{address}', '"Shop 451/A, Level 4, Sanmar Ocean City, Nasirabad, Chattogram 4203, Bangladesh"')
 WHERE key = 'store' AND value->>'address' = 'Shop 451, Level 4, Sanmar Ocean City, Chattogram 4203, Bangladesh';

-- ============================================================
-- End of migration 008
-- ============================================================
