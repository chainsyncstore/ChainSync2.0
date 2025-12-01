BEGIN;

CREATE TABLE IF NOT EXISTS price_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  source varchar(64),
  reference_id uuid,
  old_cost numeric(12,4),
  new_cost numeric(12,4),
  old_sale_price numeric(12,4),
  new_sale_price numeric(12,4),
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_change_events_store_product_idx
  ON price_change_events (store_id, product_id, occurred_at);

CREATE TABLE IF NOT EXISTS inventory_revaluation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source varchar(64),
  reference_id uuid,
  quantity_before integer NOT NULL,
  quantity_after integer NOT NULL,
  revalued_quantity integer,
  avg_cost_before numeric(12,4),
  avg_cost_after numeric(12,4),
  total_cost_before numeric(14,4),
  total_cost_after numeric(14,4),
  delta_value numeric(14,4),
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_revaluation_events_store_product_idx
  ON inventory_revaluation_events (store_id, product_id, occurred_at);

COMMIT;
