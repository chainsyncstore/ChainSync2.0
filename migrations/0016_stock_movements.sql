BEGIN;

CREATE TABLE IF NOT EXISTS stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_before integer NOT NULL DEFAULT 0,
    quantity_after integer NOT NULL DEFAULT 0,
    delta integer NOT NULL,
    action_type varchar(32) NOT NULL,
    source varchar(64),
    reference_id uuid,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    notes text,
    metadata jsonb,
    occurred_at timestamptz DEFAULT NOW(),
    created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_movements_store_occurred_idx
  ON stock_movements (store_id, occurred_at);

CREATE INDEX IF NOT EXISTS stock_movements_product_store_idx
  ON stock_movements (product_id, store_id);

COMMIT;
