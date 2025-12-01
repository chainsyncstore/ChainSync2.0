BEGIN;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS avg_cost numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_value numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cost_update timestamptz;

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost numeric(12,4) NOT NULL CHECK (unit_cost >= 0),
  source varchar(64),
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_cost_layers_store_product_idx
  ON inventory_cost_layers (store_id, product_id, created_at);

UPDATE inventory AS inv
SET
  avg_cost = COALESCE(prod.cost, 0),
  total_cost_value = COALESCE(inv.quantity, 0) * COALESCE(prod.cost, 0),
  last_cost_update = NOW()
FROM products AS prod
WHERE prod.id = inv.product_id;

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,4) NOT NULL DEFAULT 0;

UPDATE transaction_items ti
SET
  unit_cost = COALESCE(prod.cost, 0),
  total_cost = COALESCE(prod.cost, 0) * ti.quantity
FROM products AS prod
WHERE prod.id = ti.product_id;

COMMIT;
