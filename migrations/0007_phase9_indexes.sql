-- Phase 9 performance indexes
-- Composite indexes for common filters and ordering

-- PRD schema tables
CREATE INDEX IF NOT EXISTS sales_org_store_idx ON sales (org_id, store_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON audit_logs (org_id, created_at);

-- Legacy/shared schema tables where applicable
-- Ensure inventory store+product lookups are fast
CREATE INDEX IF NOT EXISTS inventory_store_product_idx ON inventory (store_id, product_id);


