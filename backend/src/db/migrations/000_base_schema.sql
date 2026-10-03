-- ============================================================
-- Premium Gadget — full PostgreSQL DDL
-- Generated for Phase 2 scaffolding
-- ============================================================

-- ─── Extensions ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()

-- ─── ENUM Types ──────────────────────────────────────
CREATE TYPE user_role         AS ENUM ('super_admin', 'branch_admin', 'customer');
CREATE TYPE product_condition AS ENUM ('new', 'used');
CREATE TYPE order_status      AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned');
CREATE TYPE payment_status    AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled');
CREATE TYPE payment_method    AS ENUM ('card', 'bkash', 'nagad', 'net_banking', 'cash', 'other');
CREATE TYPE sale_channel      AS ENUM ('online', 'pos');
CREATE TYPE repair_status     AS ENUM ('pending', 'diagnosed', 'awaiting_parts', 'repairing', 'ready', 'delivered', 'cancelled');
CREATE TYPE ticket_priority   AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE address_type      AS ENUM ('shipping', 'billing');

-- ─── Branches (created first, referenced by users) ───
CREATE TABLE branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) UNIQUE NOT NULL,
    address     TEXT NOT NULL,
    phone       VARCHAR(20),
    email       VARCHAR(255),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    lat         DECIMAL(10,7),
    lng         DECIMAL(10,7),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ───────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(120) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'customer',
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    branch_id       UUID REFERENCES branches(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- ─── OTP Codes ───────────────────────────────────────
CREATE TABLE otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(20) NOT NULL,
    code        VARCHAR(6) NOT NULL,
    purpose     VARCHAR(30) NOT NULL DEFAULT 'phone_verify',
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_phone ON otp_codes(phone);

-- ─── Addresses ───────────────────────────────────────
CREATE TABLE addresses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_type  address_type NOT NULL DEFAULT 'shipping',
    label         VARCHAR(50) DEFAULT 'Home',
    full_name     VARCHAR(120) NOT NULL,
    phone         VARCHAR(20) NOT NULL,
    division      VARCHAR(60) NOT NULL,
    district      VARCHAR(60) NOT NULL,
    area          VARCHAR(120) NOT NULL,
    street        TEXT NOT NULL,
    postal_code   VARCHAR(10),
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_type ON addresses(user_id, address_type);

-- ─── Categories ──────────────────────────────────────
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) UNIQUE NOT NULL,
    parent_id   UUID REFERENCES categories(id),
    icon_url    TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_categories_slug   ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- ─── Brands ──────────────────────────────────────────
CREATE TABLE brands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL,
    slug        VARCHAR(140) UNIQUE NOT NULL,
    logo_url    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Products ────────────────────────────────────────
CREATE TABLE products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    slug              VARCHAR(280) UNIQUE NOT NULL,
    short_description TEXT,
    description_md    TEXT,
    category_id       UUID NOT NULL REFERENCES categories(id),
    brand_id          UUID REFERENCES brands(id),
    condition         product_condition NOT NULL DEFAULT 'new',
    condition_notes   TEXT,
    is_featured       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    meta_title        VARCHAR(255),
    meta_description  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_products_slug      ON products(slug);
CREATE INDEX idx_products_category  ON products(category_id);
CREATE INDEX idx_products_brand     ON products(brand_id);
CREATE INDEX idx_products_condition ON products(condition);

-- ─── Product Specifications ─────────────────────────
CREATE TABLE product_specifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    spec_key    VARCHAR(120) NOT NULL,
    spec_value  TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_specs_product ON product_specifications(product_id);
CREATE INDEX idx_product_specs_key     ON product_specifications(spec_key);

-- ─── Product Key Features ───────────────────────────
CREATE TABLE product_key_features (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    feature     VARCHAR(255) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_key_features_product ON product_key_features(product_id);

-- ─── Product Variants ───────────────────────────────
CREATE TABLE product_variants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku              VARCHAR(60) UNIQUE NOT NULL,
    variant_name     VARCHAR(255) NOT NULL,
    color            VARCHAR(60),
    price            DECIMAL(12,2) NOT NULL,
    compare_at_price DECIMAL(12,2),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku     ON product_variants(sku);

-- ─── Variant Attributes ─────────────────────────────
CREATE TABLE variant_attributes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_key   VARCHAR(80) NOT NULL,
    attribute_value VARCHAR(120) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_variant_attrs_variant ON variant_attributes(variant_id);
CREATE INDEX idx_variant_attrs_key     ON variant_attributes(attribute_key);

-- ─── Product Images ─────────────────────────────────
CREATE TABLE product_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id  UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    image_url   TEXT NOT NULL,
    alt_text    VARCHAR(255),
    sort_order  INT NOT NULL DEFAULT 0,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_product_images_variant ON product_images(variant_id);

-- ─── Inventory ──────────────────────────────────────
CREATE TABLE inventory (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id          UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity            INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 5,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (variant_id, branch_id)
);
CREATE INDEX idx_inventory_variant ON inventory(variant_id);
CREATE INDEX idx_inventory_branch  ON inventory(branch_id);

-- ─── Orders ─────────────────────────────────────────
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number    VARCHAR(30) UNIQUE NOT NULL,
    user_id         UUID REFERENCES users(id),
    address_id      UUID REFERENCES addresses(id),
    branch_id       UUID REFERENCES branches(id),
    channel         sale_channel NOT NULL DEFAULT 'online',
    status          order_status NOT NULL DEFAULT 'pending',
    subtotal        DECIMAL(12,2) NOT NULL,
    discount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_fee    DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount    DECIMAL(12,2) NOT NULL,
    customer_note   TEXT,
    admin_note      TEXT,
    pos_operator_id UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user    ON orders(user_id);
CREATE INDEX idx_orders_status  ON orders(status);
CREATE INDEX idx_orders_channel ON orders(channel);
CREATE INDEX idx_orders_branch  ON orders(branch_id);

-- ─── Order Items ────────────────────────────────────
CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id  UUID NOT NULL REFERENCES product_variants(id),
    quantity    INT NOT NULL CHECK (quantity > 0),
    unit_price  DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─── Transactions (SSL Commerz) ─────────────────────
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id),
    ssl_session_key     TEXT,
    ssl_transaction_id  VARCHAR(120),
    ssl_validation_id   VARCHAR(120),
    ssl_status          VARCHAR(30),
    ssl_amount          DECIMAL(12,2),
    ssl_store_amount    DECIMAL(12,2),
    ssl_currency        VARCHAR(10) DEFAULT 'BDT',
    ssl_card_type       VARCHAR(60),
    ssl_card_no         VARCHAR(40),
    ssl_bank_tran_id    VARCHAR(120),
    ssl_tran_date       TIMESTAMPTZ,
    ssl_risk_level      VARCHAR(10),
    ssl_risk_title      VARCHAR(120),
    ssl_raw_response    JSONB,
    payment_method      payment_method NOT NULL,
    payment_status      payment_status NOT NULL DEFAULT 'pending',
    amount              DECIMAL(12,2) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'BDT',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transactions_order    ON transactions(order_id);
CREATE INDEX idx_transactions_ssl_txn  ON transactions(ssl_transaction_id);
CREATE INDEX idx_transactions_status   ON transactions(payment_status);

-- ─── Repair Services ────────────────────────────────
CREATE TABLE repair_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(180) NOT NULL,
    slug            VARCHAR(200) UNIQUE NOT NULL,
    description     TEXT,
    base_price      DECIMAL(12,2),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Repair Tickets ─────────────────────────────────
CREATE TABLE repair_tickets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number         VARCHAR(30) UNIQUE NOT NULL,
    customer_id           UUID REFERENCES users(id),
    customer_name         VARCHAR(120) NOT NULL,
    customer_phone        VARCHAR(20) NOT NULL,
    customer_email        VARCHAR(255),
    device_type           VARCHAR(80) NOT NULL,
    device_brand          VARCHAR(80),
    device_model          VARCHAR(120),
    device_serial         VARCHAR(120),
    issue_description     TEXT NOT NULL,
    service_id            UUID REFERENCES repair_services(id),
    status                repair_status NOT NULL DEFAULT 'pending',
    priority              ticket_priority NOT NULL DEFAULT 'medium',
    branch_id             UUID NOT NULL REFERENCES branches(id),
    assigned_technician   VARCHAR(120),
    estimated_cost        DECIMAL(12,2),
    final_cost            DECIMAL(12,2),
    internal_notes        TEXT,
    diagnosis_notes       TEXT,
    received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estimated_completion  TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    delivered_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_repair_tickets_number   ON repair_tickets(ticket_number);
CREATE INDEX idx_repair_tickets_phone    ON repair_tickets(customer_phone);
CREATE INDEX idx_repair_tickets_status   ON repair_tickets(status);
CREATE INDEX idx_repair_tickets_branch   ON repair_tickets(branch_id);
CREATE INDEX idx_repair_tickets_customer ON repair_tickets(customer_id);

-- ─── Repair Transactions ────────────────────────────
CREATE TABLE repair_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES repair_tickets(id),
    payment_method      payment_method NOT NULL,
    amount              DECIMAL(12,2) NOT NULL,
    ssl_transaction_id  VARCHAR(120),
    payment_status      payment_status NOT NULL DEFAULT 'pending',
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_repair_txn_ticket ON repair_transactions(ticket_id);

-- ─── Reviews ────────────────────────────────────────
CREATE TABLE reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       VARCHAR(200),
    body        TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user    ON reviews(user_id);

-- ─── Wishlists ──────────────────────────────────────
CREATE TABLE wishlists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

-- ─── Coupons ────────────────────────────────────────
CREATE TABLE coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(40) UNIQUE NOT NULL,
    description     TEXT,
    discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value  DECIMAL(12,2) NOT NULL,
    min_order_value DECIMAL(12,2) DEFAULT 0,
    max_uses        INT,
    used_count      INT NOT NULL DEFAULT 0,
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_until     TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_coupons_code ON coupons(code);

-- ============================================================
-- End of schema
-- ============================================================
