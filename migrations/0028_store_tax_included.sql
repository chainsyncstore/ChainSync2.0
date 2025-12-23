-- Add tax_included column to stores table
-- When true: tax is already included in sale prices (back-calculate tax from total)
-- When false: tax is added on top of sale prices (current/default behavior)
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS tax_included BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN stores.tax_included IS 'When true, sale prices already include tax. When false, tax is added to sale prices.';
