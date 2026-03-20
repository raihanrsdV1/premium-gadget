-- ============================================================
-- Premium Gadget — Seed Data
-- Runs after schema.sql (02-seed.sql)
-- Passwords use pgcrypto crypt() compatible with bcryptjs
--   super_admin  → phone: 01700000001  pass: Admin@123
--   branch_admin → phone: 01700000002  pass: Branch@123
--   customer     → phone: 01700000003  pass: Demo@123
-- ============================================================

-- ─── Branches ────────────────────────────────────────────────────────────────
INSERT INTO branches (id, name, slug, address, phone, email, is_active, lat, lng) VALUES
  ('11111111-1111-1111-1111-111111111101',
   'Dhaka Main Branch', 'dhaka-main',
   'Level 4, Multiplan Center, New Elephant Road, Dhaka-1205',
   '01700-000001', 'dhaka@premiumgadget.com', TRUE,
   23.7461, 90.3742),

  ('11111111-1111-1111-1111-111111111102',
   'Chittagong Branch', 'chittagong',
   '3rd Floor, Deen Plaza, Agrabad, Chittagong-4100',
   '01700-000002', 'ctg@premiumgadget.com', TRUE,
   22.3303, 91.8317);

-- ─── Users ───────────────────────────────────────────────────────────────────
INSERT INTO users (id, full_name, phone, email, password_hash, role, phone_verified, is_active, branch_id) VALUES
  ('22222222-2222-2222-2222-222222222201',
   'Super Admin', '01700000001', 'admin@premiumgadget.com',
   crypt('Admin@123', gen_salt('bf', 10)),
   'super_admin', TRUE, TRUE, '11111111-1111-1111-1111-111111111101'),

  ('22222222-2222-2222-2222-222222222202',
   'Branch Staff', '01700000002', 'staff@premiumgadget.com',
   crypt('Branch@123', gen_salt('bf', 10)),
   'branch_admin', TRUE, TRUE, '11111111-1111-1111-1111-111111111102'),

  ('22222222-2222-2222-2222-222222222203',
   'Demo Customer', '01700000003', 'demo@example.com',
   crypt('Demo@123', gen_salt('bf', 10)),
   'customer', TRUE, TRUE, NULL);

-- ─── Categories ──────────────────────────────────────────────────────────────
INSERT INTO categories (id, name, slug, parent_id, sort_order, is_active) VALUES
  ('33333333-3333-3333-3333-333333333301', 'Laptops',         'laptops',         NULL,                                           1, TRUE),
  ('33333333-3333-3333-3333-333333333302', 'MacBooks',        'macbooks',        '33333333-3333-3333-3333-333333333301',          2, TRUE),
  ('33333333-3333-3333-3333-333333333303', 'Windows Laptops', 'windows-laptops', '33333333-3333-3333-3333-333333333301',          3, TRUE),
  ('33333333-3333-3333-3333-333333333304', 'Accessories',     'accessories',     NULL,                                           4, TRUE),
  ('33333333-3333-3333-3333-333333333305', 'Pre-Owned',       'pre-owned',       NULL,                                           5, TRUE);

-- ─── Brands ──────────────────────────────────────────────────────────────────
INSERT INTO brands (id, name, slug, is_active) VALUES
  ('44444444-4444-4444-4444-444444444401', 'Apple',    'apple',    TRUE),
  ('44444444-4444-4444-4444-444444444402', 'Dell',     'dell',     TRUE),
  ('44444444-4444-4444-4444-444444444403', 'Lenovo',   'lenovo',   TRUE),
  ('44444444-4444-4444-4444-444444444404', 'HP',       'hp',       TRUE),
  ('44444444-4444-4444-4444-444444444405', 'Logitech', 'logitech', TRUE),
  ('44444444-4444-4444-4444-444444444406', 'Samsung',  'samsung',  TRUE),
  ('44444444-4444-4444-4444-444444444407', 'Anker',    'anker',    TRUE),
  ('44444444-4444-4444-4444-444444444408', 'Sony',     'sony',     TRUE);

-- ─── Products ────────────────────────────────────────────────────────────────
INSERT INTO products (id, name, slug, short_description, condition, is_featured, is_active, category_id, brand_id) VALUES
  ('55555555-5555-5555-5555-555555555501',
   'MacBook Pro M3 14"',
   'macbook-pro-m3-14-inch',
   'Apple''s most powerful 14" laptop with the M3 chip — blazing performance for pros.',
   'new', TRUE, TRUE,
   '33333333-3333-3333-3333-333333333302',
   '44444444-4444-4444-4444-444444444401'),

  ('55555555-5555-5555-5555-555555555502',
   'Dell XPS 15 OLED',
   'dell-xps-15-oled',
   'Premium 15.6" OLED display laptop, ideal for creatives and power users.',
   'used', TRUE, TRUE,
   '33333333-3333-3333-3333-333333333303',
   '44444444-4444-4444-4444-444444444402'),

  ('55555555-5555-5555-5555-555555555503',
   'Lenovo ThinkPad X1 Carbon Gen 11',
   'lenovo-thinkpad-x1-carbon-gen-11',
   'The gold standard of business ultrabooks — featherlight, sturdy, and secure.',
   'used', TRUE, TRUE,
   '33333333-3333-3333-3333-333333333303',
   '44444444-4444-4444-4444-444444444403'),

  ('55555555-5555-5555-5555-555555555504',
   'Logitech MX Keys S',
   'logitech-mx-keys-s',
   'Advanced full-size wireless keyboard with smart illumination and precise typing.',
   'new', TRUE, TRUE,
   '33333333-3333-3333-3333-333333333304',
   '44444444-4444-4444-4444-444444444405'),

  ('55555555-5555-5555-5555-555555555505',
   'Samsung T7 Portable SSD 1TB',
   'samsung-t7-portable-ssd-1tb',
   'Ultra-fast USB 3.2 Gen 2 portable SSD with 1,050 MB/s read speeds.',
   'new', FALSE, TRUE,
   '33333333-3333-3333-3333-333333333304',
   '44444444-4444-4444-4444-444444444406'),

  ('55555555-5555-5555-5555-555555555506',
   'HP Envy 15 x360',
   'hp-envy-15-x360',
   '2-in-1 convertible laptop with OLED touch display and AMD Ryzen 7.',
   'used', FALSE, TRUE,
   '33333333-3333-3333-3333-333333333303',
   '44444444-4444-4444-4444-444444444404');

-- ─── Product Variants ────────────────────────────────────────────────────────
INSERT INTO product_variants (id, product_id, sku, variant_name, color, price, compare_at_price, is_active) VALUES
  -- MacBook Pro M3
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555501',
   'APL-MBP-M3-SG-8-512', 'Space Gray · 8GB · 512GB', 'Space Gray', 195000.00, 220000.00, TRUE),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555501',
   'APL-MBP-M3-SG-16-1TB', 'Space Gray · 16GB · 1TB', 'Space Gray', 235000.00, 260000.00, TRUE),
  ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555501',
   'APL-MBP-M3-SLV-8-512', 'Silver · 8GB · 512GB', 'Silver', 195000.00, 220000.00, TRUE),

  -- Dell XPS 15
  ('66666666-6666-6666-6666-666666666611', '55555555-5555-5555-5555-555555555502',
   'DL-XPS15-OLED-I7-16-512', 'Platinum Silver · i7 · 16GB · 512GB', 'Platinum Silver', 165000.00, NULL, TRUE),
  ('66666666-6666-6666-6666-666666666612', '55555555-5555-5555-5555-555555555502',
   'DL-XPS15-OLED-I9-32-1TB', 'Platinum Silver · i9 · 32GB · 1TB', 'Platinum Silver', 198000.00, NULL, TRUE),

  -- Lenovo ThinkPad X1
  ('66666666-6666-6666-6666-666666666621', '55555555-5555-5555-5555-555555555503',
   'LN-X1C-G11-I5-16-256', 'Black · i5 · 16GB · 256GB', 'Black', 140000.00, NULL, TRUE),
  ('66666666-6666-6666-6666-666666666622', '55555555-5555-5555-5555-555555555503',
   'LN-X1C-G11-I7-16-512', 'Black · i7 · 16GB · 512GB', 'Black', 162000.00, NULL, TRUE),

  -- Logitech MX Keys S (single variant)
  ('66666666-6666-6666-6666-666666666631', '55555555-5555-5555-5555-555555555504',
   'LG-MXKEYS-S-BLK', 'Graphite', 'Graphite', 12500.00, 14500.00, TRUE),

  -- Samsung T7 (single)
  ('66666666-6666-6666-6666-666666666641', '55555555-5555-5555-5555-555555555505',
   'SM-T7-BLK-1TB', 'Titan Gray', 'Titan Gray', 9800.00, 11500.00, TRUE),

  -- HP Envy 15 (single)
  ('66666666-6666-6666-6666-666666666651', '55555555-5555-5555-5555-555555555506',
   'HP-ENVY15-X360-R7-16-512', 'Natural Silver · Ryzen 7 · 16GB · 512GB', 'Natural Silver', 120000.00, NULL, TRUE);

-- ─── Variant Attributes ──────────────────────────────────────────────────────
INSERT INTO variant_attributes (variant_id, attribute_key, attribute_value, sort_order) VALUES
  ('66666666-6666-6666-6666-666666666601', 'RAM',     '8GB',   1),
  ('66666666-6666-6666-6666-666666666601', 'Storage', '512GB', 2),
  ('66666666-6666-6666-6666-666666666602', 'RAM',     '16GB',  1),
  ('66666666-6666-6666-6666-666666666602', 'Storage', '1TB',   2),
  ('66666666-6666-6666-6666-666666666603', 'RAM',     '8GB',   1),
  ('66666666-6666-6666-6666-666666666603', 'Storage', '512GB', 2),

  ('66666666-6666-6666-6666-666666666611', 'CPU', 'Intel Core i7-13700H', 1),
  ('66666666-6666-6666-6666-666666666611', 'RAM', '16GB DDR5',           2),
  ('66666666-6666-6666-6666-666666666611', 'Storage', '512GB NVMe SSD',  3),
  ('66666666-6666-6666-6666-666666666612', 'CPU', 'Intel Core i9-13900H', 1),
  ('66666666-6666-6666-6666-666666666612', 'RAM', '32GB DDR5',            2),
  ('66666666-6666-6666-6666-666666666612', 'Storage', '1TB NVMe SSD',     3),

  ('66666666-6666-6666-6666-666666666621', 'CPU', 'Intel Core i5-1335U', 1),
  ('66666666-6666-6666-6666-666666666621', 'RAM', '16GB LPDDR5',         2),
  ('66666666-6666-6666-6666-666666666621', 'Storage', '256GB NVMe SSD',  3),
  ('66666666-6666-6666-6666-666666666622', 'CPU', 'Intel Core i7-1365U', 1),
  ('66666666-6666-6666-6666-666666666622', 'RAM', '16GB LPDDR5',         2),
  ('66666666-6666-6666-6666-666666666622', 'Storage', '512GB NVMe SSD',  3),

  ('66666666-6666-6666-6666-666666666651', 'CPU', 'AMD Ryzen 7 7730U', 1),
  ('66666666-6666-6666-6666-666666666651', 'RAM', '16GB DDR4',         2),
  ('66666666-6666-6666-6666-666666666651', 'Storage', '512GB NVMe',    3);

-- ─── Product Images ──────────────────────────────────────────────────────────
INSERT INTO product_images (product_id, variant_id, image_url, alt_text, sort_order, is_primary) VALUES
  -- MacBook Pro M3
  ('55555555-5555-5555-5555-555555555501', NULL,
   'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
   'MacBook Pro M3 front view', 1, TRUE),
  ('55555555-5555-5555-5555-555555555501', NULL,
   'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80',
   'MacBook Pro M3 side view', 2, FALSE),

  -- Dell XPS 15
  ('55555555-5555-5555-5555-555555555502', NULL,
   'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=800&q=80',
   'Dell XPS 15 OLED open', 1, TRUE),

  -- Lenovo ThinkPad X1
  ('55555555-5555-5555-5555-555555555503', NULL,
   'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=800&q=80',
   'Lenovo ThinkPad X1 Carbon', 1, TRUE),

  -- Logitech MX Keys S
  ('55555555-5555-5555-5555-555555555504', NULL,
   'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
   'Logitech MX Keys S keyboard', 1, TRUE),

  -- Samsung T7
  ('55555555-5555-5555-5555-555555555505', NULL,
   'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=800&q=80',
   'Samsung T7 Portable SSD', 1, TRUE),

  -- HP Envy 15
  ('55555555-5555-5555-5555-555555555506', NULL,
   'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=800&q=80',
   'HP Envy 15 x360 convertible', 1, TRUE);

-- ─── Product Specifications ──────────────────────────────────────────────────
INSERT INTO product_specifications (product_id, spec_key, spec_value, sort_order) VALUES
  -- MacBook Pro M3
  ('55555555-5555-5555-5555-555555555501', 'Processor',      'Apple M3 (8-core CPU, 10-core GPU)', 1),
  ('55555555-5555-5555-5555-555555555501', 'Display',        '14.2" Liquid Retina XDR (3024×1964)', 2),
  ('55555555-5555-5555-5555-555555555501', 'Memory',         '8GB or 16GB Unified Memory',          3),
  ('55555555-5555-5555-5555-555555555501', 'Storage',        '512GB or 1TB SSD',                    4),
  ('55555555-5555-5555-5555-555555555501', 'Battery',        'Up to 18 hours',                      5),
  ('55555555-5555-5555-5555-555555555501', 'Weight',         '1.55 kg',                             6),
  ('55555555-5555-5555-5555-555555555501', 'OS',             'macOS Sonoma',                        7),

  -- Dell XPS 15
  ('55555555-5555-5555-5555-555555555502', 'Processor',      'Intel Core i7/i9 13th Gen',            1),
  ('55555555-5555-5555-5555-555555555502', 'Display',        '15.6" 3.5K OLED Touch (3456×2160)',    2),
  ('55555555-5555-5555-5555-555555555502', 'Memory',         '16GB or 32GB DDR5',                    3),
  ('55555555-5555-5555-5555-555555555502', 'Storage',        '512GB or 1TB NVMe SSD',                4),
  ('55555555-5555-5555-5555-555555555502', 'GPU',            'NVIDIA GeForce RTX 4060',              5),
  ('55555555-5555-5555-5555-555555555502', 'Battery',        'Up to 13 hours',                       6),
  ('55555555-5555-5555-5555-555555555502', 'OS',             'Windows 11 Home',                      7),

  -- Lenovo ThinkPad X1
  ('55555555-5555-5555-5555-555555555503', 'Processor',      'Intel Core i5/i7 13th Gen (Evo)',      1),
  ('55555555-5555-5555-5555-555555555503', 'Display',        '14" IPS (1920×1200) Anti-Glare',       2),
  ('55555555-5555-5555-5555-555555555503', 'Memory',         '16GB LPDDR5',                          3),
  ('55555555-5555-5555-5555-555555555503', 'Storage',        '256GB or 512GB NVMe SSD',              4),
  ('55555555-5555-5555-5555-555555555503', 'Weight',         '1.12 kg',                              5),
  ('55555555-5555-5555-5555-555555555503', 'MIL-SPEC',       'MIL-STD-810H Certified',               6),
  ('55555555-5555-5555-5555-555555555503', 'OS',             'Windows 11 Pro',                       7),

  -- Logitech MX Keys S
  ('55555555-5555-5555-5555-555555555504', 'Layout',         'Full-size QWERTY', 1),
  ('55555555-5555-5555-5555-555555555504', 'Connectivity',   'Bluetooth 5.0 / Logi Bolt USB', 2),
  ('55555555-5555-5555-5555-555555555504', 'Multi-Device',   'Up to 3 devices', 3),
  ('55555555-5555-5555-5555-555555555504', 'Battery',        'Up to 10 days (backlit), 5 months (no backlight)', 4),
  ('55555555-5555-5555-5555-555555555504', 'Compatibility',  'Windows / macOS / Linux / iOS / Android', 5),

  -- Samsung T7
  ('55555555-5555-5555-5555-555555555505', 'Capacity',       '1TB', 1),
  ('55555555-5555-5555-5555-555555555505', 'Interface',      'USB 3.2 Gen 2 (10Gbps)', 2),
  ('55555555-5555-5555-5555-555555555505', 'Read Speed',     'Up to 1,050 MB/s', 3),
  ('55555555-5555-5555-5555-555555555505', 'Write Speed',    'Up to 1,000 MB/s', 4),
  ('55555555-5555-5555-5555-555555555505', 'Dimensions',     '85.0 × 57.0 × 8.0 mm', 5),
  ('55555555-5555-5555-5555-555555555505', 'Weight',         '58g', 6),

  -- HP Envy 15
  ('55555555-5555-5555-5555-555555555506', 'Processor',      'AMD Ryzen 7 7730U',                    1),
  ('55555555-5555-5555-5555-555555555506', 'Display',        '15.6" OLED Touch (1920×1080)',          2),
  ('55555555-5555-5555-5555-555555555506', 'Memory',         '16GB DDR4',                             3),
  ('55555555-5555-5555-5555-555555555506', 'Storage',        '512GB NVMe SSD',                        4),
  ('55555555-5555-5555-5555-555555555506', 'Form Factor',    '2-in-1 Convertible (360° hinge)',        5),
  ('55555555-5555-5555-5555-555555555506', 'OS',             'Windows 11 Home',                       6);

-- ─── Product Key Features ────────────────────────────────────────────────────
INSERT INTO product_key_features (product_id, feature, sort_order) VALUES
  ('55555555-5555-5555-5555-555555555501', 'Apple M3 chip — up to 2× faster than M1', 1),
  ('55555555-5555-5555-5555-555555555501', 'Liquid Retina XDR display with ProMotion 120Hz', 2),
  ('55555555-5555-5555-5555-555555555501', 'Up to 18 hours of battery life', 3),
  ('55555555-5555-5555-5555-555555555501', 'MagSafe 3 charging + Thunderbolt 4 ports', 4),
  ('55555555-5555-5555-5555-555555555501', '1080p FaceTime HD camera with Center Stage', 5),

  ('55555555-5555-5555-5555-555555555502', '3.5K OLED InfinityEdge touchscreen — 100% DCI-P3', 1),
  ('55555555-5555-5555-5555-555555555502', 'NVIDIA RTX 4060 dedicated graphics', 2),
  ('55555555-5555-5555-5555-555555555502', 'Thunderbolt 4 × 2 + USB-A + SD card reader', 3),
  ('55555555-5555-5555-5555-555555555502', 'Good condition — minor cosmetic wear only', 4),

  ('55555555-5555-5555-5555-555555555503', 'Only 1.12 kg — lightest in its class', 1),
  ('55555555-5555-5555-5555-555555555503', 'MIL-STD-810H military-grade durability', 2),
  ('55555555-5555-5555-5555-555555555503', 'Intel Evo platform certification', 3),
  ('55555555-5555-5555-5555-555555555503', 'ThinkShield hardware security', 4),
  ('55555555-5555-5555-5555-555555555503', 'Good cosmetic condition — fully tested', 5),

  ('55555555-5555-5555-5555-555555555504', 'Smart backlighting adjusts to ambient light', 1),
  ('55555555-5555-5555-5555-555555555504', 'Easy-switch between 3 devices simultaneously', 2),
  ('55555555-5555-5555-5555-555555555504', 'Spherically dished keys for comfortable typing', 3),

  ('55555555-5555-5555-5555-555555555505', 'Hardware AES-256-bit encryption', 1),
  ('55555555-5555-5555-5555-555555555505', 'Shock-resistant metal casing', 2),
  ('55555555-5555-5555-5555-555555555505', 'Compatible with USB-C and USB-A (adaptor included)', 3),

  ('55555555-5555-5555-5555-555555555506', 'OLED touch display with 100% sRGB coverage', 1),
  ('55555555-5555-5555-5555-555555555506', '360-degree hinge for tablet mode', 2),
  ('55555555-5555-5555-5555-555555555506', 'Pre-owned in excellent condition — tested & certified', 3);

-- ─── Inventory ───────────────────────────────────────────────────────────────
INSERT INTO inventory (variant_id, branch_id, quantity, low_stock_threshold) VALUES
  ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111101', 5, 2),
  ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111101', 3, 2),
  ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111101', 2, 2),
  ('66666666-6666-6666-6666-666666666611', '11111111-1111-1111-1111-111111111101', 3, 2),
  ('66666666-6666-6666-6666-666666666612', '11111111-1111-1111-1111-111111111101', 1, 2),
  ('66666666-6666-6666-6666-666666666621', '11111111-1111-1111-1111-111111111101', 2, 2),
  ('66666666-6666-6666-6666-666666666622', '11111111-1111-1111-1111-111111111101', 2, 2),
  ('66666666-6666-6666-6666-666666666631', '11111111-1111-1111-1111-111111111101', 15, 5),
  ('66666666-6666-6666-6666-666666666641', '11111111-1111-1111-1111-111111111101', 8, 5),
  ('66666666-6666-6666-6666-666666666651', '11111111-1111-1111-1111-111111111102', 4, 2);

-- ─── Repair Services ─────────────────────────────────────────────────────────
INSERT INTO repair_services (id, name, slug, description, base_price, is_active) VALUES
  ('77777777-7777-7777-7777-777777777701',
   'Screen Replacement', 'screen-replacement',
   'Professional screen replacement for laptops and smartphones. Genuine or high-quality OEM parts.',
   3500.00, TRUE),

  ('77777777-7777-7777-7777-777777777702',
   'Battery Replacement', 'battery-replacement',
   'Restore your device to full battery capacity with a genuine replacement cell.',
   2000.00, TRUE),

  ('77777777-7777-7777-7777-777777777703',
   'SSD & RAM Upgrade', 'ssd-ram-upgrade',
   'Speed up your laptop with a fast NVMe SSD or expanded RAM. Installation included.',
   500.00, TRUE),

  ('77777777-7777-7777-7777-777777777704',
   'Motherboard Repair', 'motherboard-repair',
   'Expert component-level micro-soldering for power faults, GPU issues, and liquid damage.',
   5000.00, TRUE),

  ('77777777-7777-7777-7777-777777777705',
   'Keyboard & Trackpad', 'keyboard-trackpad',
   'Fix sticky keys, dead trackpad, or liquid-damaged input devices.',
   2500.00, TRUE),

  ('77777777-7777-7777-7777-777777777706',
   'Full Diagnostic', 'full-diagnostic',
   'Comprehensive hardware and software diagnostic. Fee waived if you proceed with repair.',
   500.00, TRUE);

-- ─── Repair Tickets ──────────────────────────────────────────────────────────
INSERT INTO repair_tickets
  (id, ticket_number, customer_id, customer_name, customer_phone, customer_email,
   device_type, device_brand, device_model, issue_description,
   service_id, status, priority, branch_id, assigned_technician,
   estimated_cost, final_cost, diagnosis_notes,
   received_at, estimated_completion)
VALUES
  ('88888888-8888-8888-8888-888888888801',
   'RPR-1234',
   '22222222-2222-2222-2222-222222222203',
   'Demo Customer', '01700000003', 'demo@example.com',
   'Laptop', 'Apple', 'MacBook Pro 2021 (M1)',
   'Screen not turning on. Liquid damage suspected after spill.',
   '77777777-7777-7777-7777-777777777704',
   'repairing', 'high',
   '11111111-1111-1111-1111-111111111101',
   'Rahim Al-Mamun',
   8500.00, NULL,
   'Motherboard liquid damage confirmed. Corrosion on power management IC. Cleaning and component replacement in progress.',
   NOW() - INTERVAL '2 days',
   NOW() + INTERVAL '2 days'),

  ('88888888-8888-8888-8888-888888888802',
   'RPR-1233',
   NULL,
   'Sadia Rahman', '01711222333', 'sadia@example.com',
   'Laptop', 'Dell', 'Dell XPS 15 (2022)',
   'Battery swelling, keyboard keys are sticky.',
   '77777777-7777-7777-7777-777777777702',
   'ready', 'medium',
   '11111111-1111-1111-1111-111111111101',
   'Karim Uddin',
   4200.00, 4200.00,
   'Battery replaced with genuine Dell replacement. Keyboard cleaned — all keys functional.',
   NOW() - INTERVAL '4 days',
   NOW() - INTERVAL '1 day'),

  ('88888888-8888-8888-8888-888888888803',
   'RPR-1232',
   NULL,
   'Nadia Islam', '01900444555', NULL,
   'Laptop', 'Lenovo', 'ThinkPad X1 Carbon Gen 10',
   'SSD upgrade to 1TB requested + RAM upgrade to 32GB.',
   '77777777-7777-7777-7777-777777777703',
   'delivered', 'low',
   '11111111-1111-1111-1111-111111111102',
   'Branch Staff',
   3500.00, 3500.00,
   'SSD upgraded to Samsung 970 EVO Plus 1TB. RAM upgraded to 32GB. All tests passed.',
   NOW() - INTERVAL '6 days',
   NOW() - INTERVAL '4 days');

-- ─── Coupons ─────────────────────────────────────────────────────────────────
INSERT INTO coupons (id, code, description, discount_type, discount_value,
                     min_order_value, max_uses, used_count,
                     valid_from, valid_until, is_active) VALUES
  ('99999999-9999-9999-9999-999999999901',
   'WELCOME20', '20% off for new customers on first order',
   'percentage', 20.00,
   5000.00, 100, 45,
   NOW() - INTERVAL '30 days', NOW() + INTERVAL '90 days', TRUE),

  ('99999999-9999-9999-9999-999999999902',
   'FLAT500', '৳500 flat discount on orders above ৳10,000',
   'fixed', 500.00,
   10000.00, 200, 120,
   NOW() - INTERVAL '60 days', NOW() + INTERVAL '60 days', TRUE),

  ('99999999-9999-9999-9999-999999999903',
   'REPAIR10', '10% off on any repair service',
   'percentage', 10.00,
   2000.00, 50, 30,
   NOW() - INTERVAL '15 days', NOW() + INTERVAL '45 days', TRUE);

-- ─── Sample Orders ───────────────────────────────────────────────────────────
INSERT INTO orders (id, order_number, user_id, branch_id, channel, status,
                    subtotal, discount, shipping_fee, total_amount)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'ORD-202603-9871',
   '22222222-2222-2222-2222-222222222203',
   '11111111-1111-1111-1111-111111111101',
   'online', 'delivered',
   195000.00, 0.00, 100.00, 195100.00),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'ORD-202603-9872',
   '22222222-2222-2222-2222-222222222203',
   '11111111-1111-1111-1111-111111111101',
   'online', 'processing',
   12500.00, 0.00, 100.00, 12600.00);

INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '66666666-6666-6666-6666-666666666601',
   1, 195000.00, 195000.00),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '66666666-6666-6666-6666-666666666631',
   1, 12500.00, 12500.00);

-- ─── Reviews ─────────────────────────────────────────────────────────────────
INSERT INTO reviews (product_id, user_id, rating, title, body, is_approved) VALUES
  ('55555555-5555-5555-5555-555555555501',
   '22222222-2222-2222-2222-222222222203',
   5, 'Absolutely love it',
   'Bought the M3 MacBook Pro and it''s the best laptop I''ve ever owned. Insane battery life.',
   TRUE),

  ('55555555-5555-5555-5555-555555555502',
   '22222222-2222-2222-2222-222222222203',
   4, 'Great pre-owned deal',
   'The XPS 15 came in excellent condition. The OLED screen is gorgeous. Highly recommended.',
   TRUE);

-- ─── Wishlists ───────────────────────────────────────────────────────────────
INSERT INTO wishlists (user_id, product_id) VALUES
  ('22222222-2222-2222-2222-222222222203', '55555555-5555-5555-5555-555555555501'),
  ('22222222-2222-2222-2222-222222222203', '55555555-5555-5555-5555-555555555503');
