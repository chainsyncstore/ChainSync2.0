-- Promotion Feature Migration
-- Adds tables for managing product promotions with percentage discounts and bundle deals

-- Promotion types and scopes
DO $$ BEGIN
  CREATE TYPE promotion_type AS ENUM ('percentage', 'bundle');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE promotion_scope AS ENUM ('all_products', 'category', 'specific_products');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE promotion_status AS ENUM ('draft', 'scheduled', 'active', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Main promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE, -- NULL = all stores in org
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Promotion type and configuration
  promotion_type promotion_type NOT NULL,
  scope promotion_scope NOT NULL,
  category_filter VARCHAR(255), -- For category-based scope
  
  -- Discount configuration
  discount_percent DECIMAL(5, 2), -- e.g., 15.00 for 15% off
  bundle_buy_quantity INTEGER, -- e.g., 2 for "Buy 2"
  bundle_get_quantity INTEGER, -- e.g., 1 for "Get 1 Free"
  
  -- Pricing mode
  per_product_pricing BOOLEAN NOT NULL DEFAULT false, -- If true, each product can have custom discount
  
  -- Scheduling
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status (computed from dates, but cached for query performance)
  status promotion_status NOT NULL DEFAULT 'draft',
  
  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for specific product associations
CREATE TABLE IF NOT EXISTS promotion_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Per-product override (when per_product_pricing = true)
  custom_discount_percent DECIMAL(5, 2),
  
  UNIQUE(promotion_id, product_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS promotions_org_idx ON promotions(org_id, status);
CREATE INDEX IF NOT EXISTS promotions_store_idx ON promotions(store_id, status) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promotions_date_idx ON promotions(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS promotions_status_idx ON promotions(status);
CREATE INDEX IF NOT EXISTS promotion_products_promotion_idx ON promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS promotion_products_product_idx ON promotion_products(product_id);

-- Add constraint to ensure valid date range
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_valid_date_range;
ALTER TABLE promotions ADD CONSTRAINT promotions_valid_date_range CHECK (ends_at > starts_at);

-- Add constraint to ensure percentage discount is valid
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_valid_discount;
ALTER TABLE promotions ADD CONSTRAINT promotions_valid_discount 
  CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));

-- Add constraint for bundle configuration
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_valid_bundle;
ALTER TABLE promotions ADD CONSTRAINT promotions_valid_bundle 
  CHECK (
    promotion_type != 'bundle' OR 
    (bundle_buy_quantity IS NOT NULL AND bundle_buy_quantity > 0 AND 
     bundle_get_quantity IS NOT NULL AND bundle_get_quantity > 0)
  );
