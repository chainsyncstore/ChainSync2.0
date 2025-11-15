BEGIN;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS store_id uuid;
UPDATE returns r
SET store_id = s.store_id
FROM sales s
WHERE s.id = r.sale_id AND r.store_id IS NULL;
ALTER TABLE returns
  ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS currency varchar(8) NOT NULL DEFAULT 'USD';
UPDATE returns r
SET currency = COALESCE(st.currency, 'USD')
FROM sales s
JOIN stores st ON st.id = s.store_id
WHERE s.id = r.sale_id;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_type varchar(32) NOT NULL DEFAULT 'FULL';
ALTER TABLE returns ADD COLUMN IF NOT EXISTS total_refund numeric(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES sale_items(id),
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  restock_action varchar(16) NOT NULL,
  refund_type varchar(16) NOT NULL DEFAULT 'NONE',
  refund_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS return_items_return_idx ON return_items(return_id);
CREATE INDEX IF NOT EXISTS return_items_sale_item_idx ON return_items(sale_item_id);

COMMIT;
