-- Real products table, source of truth for the catalog from here on.
-- Replaces the static bundled apps/api/src/data/products.json (seeded into
-- this table by migration 0014) and the product_overrides/category_overrides
-- tables (0001), which were write-only - overrides were saved but catalog.ts
-- never read them back, so admin edits never reached the storefront. Those
-- two old tables are left in place (no destructive drop) but are no longer
-- referenced by application code as of this migration.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  price_cents INTEGER NOT NULL,
  compare_at_price_cents INTEGER,
  final_price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 4,
  visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'visible', 'hidden')),
  featured INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  is_deal INTEGER NOT NULL DEFAULT 0,
  rating_average REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_visibility ON products(visibility);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
