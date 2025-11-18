BEGIN;

-- Ensure each store has at most one inventory row per product so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS inventory_store_product_unique
  ON inventory (store_id, product_id);

COMMIT;
