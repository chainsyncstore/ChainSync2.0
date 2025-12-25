-- Add promotion tracking columns to transaction_items for analytics
-- This enables tracking of promotion discounts for both percentage and bundle promotions

-- Add promotion reference to transaction_items
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;

-- Add promotion discount amount (originalPrice - salePrice) × quantity
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS promotion_discount DECIMAL(12, 2) DEFAULT 0;

-- Store original unit price before promotion was applied
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS original_unit_price DECIMAL(12, 2);

-- Flag for bundle promotion free items
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS is_free_item BOOLEAN DEFAULT false;

-- Add index for promotion analytics queries
CREATE INDEX IF NOT EXISTS transaction_items_promotion_idx ON transaction_items(promotion_id) WHERE promotion_id IS NOT NULL;
