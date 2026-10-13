/**
 * Ordered, append-only migrations. Each runs once inside a transaction and is
 * recorded in the schema_migrations table. Never edit a shipped migration —
 * add a new one.
 *
 * Money columns are INTEGER amounts in the store currency's minor unit.
 * Timestamps are ISO-8601 UTC strings.
 */
export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  locale        TEXT NOT NULL DEFAULT 'en',
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE addresses (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  country     TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_addresses_user ON addresses(user_id);

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_mn     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE brands (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE products (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  sku               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  name_mn           TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  specs_json        TEXT NOT NULL DEFAULT '[]',
  category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand_id          INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  price             INTEGER NOT NULL CHECK (price >= 0),
  sale_price        INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  featured          INTEGER NOT NULL DEFAULT 0,
  option_names_json TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_status ON products(status);

CREATE TABLE product_images (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt         TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_images_product ON product_images(product_id);

-- Every product has at least one variant; a simple product has exactly one with no options.
-- Stock lives on the variant.
CREATE TABLE product_variants (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '',
  color_hex   TEXT NOT NULL DEFAULT '',
  size        TEXT NOT NULL DEFAULT '',
  price       INTEGER CHECK (price IS NULL OR price >= 0),
  sale_price  INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, color, size)
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE cart_items (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  updated_at  TEXT NOT NULL,
  UNIQUE (user_id, variant_id)
);

CREATE TABLE wishlist_items (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, product_id)
);

CREATE TABLE coupons (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description   TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value         INTEGER NOT NULL CHECK (value > 0),
  min_subtotal  INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  starts_at     TEXT,
  ends_at       TEXT,
  usage_limit   INTEGER,
  used_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY,
  number             TEXT NOT NULL UNIQUE,
  access_token_hash  TEXT NOT NULL,
  idempotency_key    TEXT UNIQUE,
  user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email              TEXT NOT NULL,
  full_name          TEXT NOT NULL,
  phone              TEXT NOT NULL,
  country            TEXT NOT NULL,
  city               TEXT NOT NULL,
  address            TEXT NOT NULL,
  postal_code        TEXT NOT NULL DEFAULT '',
  delivery_notes     TEXT NOT NULL DEFAULT '',
  shipping_method    TEXT NOT NULL,
  payment_method     TEXT NOT NULL,
  currency           TEXT NOT NULL,
  subtotal           INTEGER NOT NULL,
  discount           INTEGER NOT NULL DEFAULT 0,
  coupon_code        TEXT,
  shipping_fee       INTEGER NOT NULL DEFAULT 0,
  tax                INTEGER NOT NULL DEFAULT 0,
  tax_inclusive      INTEGER NOT NULL DEFAULT 1,
  total              INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status     TEXT NOT NULL DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid','pending','paid','failed','refunded')),
  stock_released     INTEGER NOT NULL DEFAULT 0,
  reserved_until     TEXT,
  cancel_requested   INTEGER NOT NULL DEFAULT 0,
  cancel_reason      TEXT NOT NULL DEFAULT '',
  locale             TEXT NOT NULL DEFAULT 'en',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- Snapshot of what was bought, at the price paid. Never updated after insert.
CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id    INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  sku           TEXT NOT NULL,
  image         TEXT NOT NULL DEFAULT '',
  unit_price    INTEGER NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  line_total    INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT 'system',
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_order_events_order ON order_events(order_id);

CREATE TABLE payments (
  id                 INTEGER PRIMARY KEY,
  order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  provider_ref       TEXT,
  amount             INTEGER NOT NULL,
  currency           TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
  is_demo            INTEGER NOT NULL DEFAULT 0,
  raw_event_id       TEXT UNIQUE,
  note               TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX idx_payments_provider_ref ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE blog_categories (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE blog_posts (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  excerpt          TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  image            TEXT NOT NULL DEFAULT '',
  image_alt        TEXT NOT NULL DEFAULT '',
  author           TEXT NOT NULL DEFAULT '',
  category_id      INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  is_sample        INTEGER NOT NULL DEFAULT 0,
  seo_title        TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  published_at     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_blog_status ON blog_posts(status, published_at);

CREATE TABLE faqs (
  id          INTEGER PRIMARY KEY,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  question_mn TEXT NOT NULL DEFAULT '',
  answer_mn   TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE newsletter_subscribers (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL
);

CREATE TABLE contact_messages (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
`,
  },
];
