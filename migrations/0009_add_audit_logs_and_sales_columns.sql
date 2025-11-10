BEGIN;

-- Ensure audit_logs table exists with expected structure
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  user_id uuid,
  action varchar(64) NOT NULL,
  entity varchar(64) NOT NULL,
  entity_id uuid,
  meta jsonb,
  ip varchar(64),
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at);

-- Align sales table columns with application schema
DO $$
DECLARE
  has_column boolean;
  has_source boolean;
BEGIN
  -- discount column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'discount'
  ) INTO has_column;

  IF NOT has_column THEN
    EXECUTE 'ALTER TABLE sales ADD COLUMN discount numeric(12,2)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'discount_amount'
  ) INTO has_source;

  IF has_source THEN
    EXECUTE 'UPDATE sales SET discount = COALESCE(discount, discount_amount)';
  END IF;

  EXECUTE 'UPDATE sales SET discount = COALESCE(discount, 0)';
  EXECUTE 'ALTER TABLE sales ALTER COLUMN discount SET DEFAULT 0';

  IF NOT EXISTS (SELECT 1 FROM sales WHERE discount IS NULL) THEN
    EXECUTE 'ALTER TABLE sales ALTER COLUMN discount SET NOT NULL';
  END IF;

  -- tax column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'tax'
  ) INTO has_column;

  IF NOT has_column THEN
    EXECUTE 'ALTER TABLE sales ADD COLUMN tax numeric(12,2)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'tax_amount'
  ) INTO has_source;

  IF has_source THEN
    EXECUTE 'UPDATE sales SET tax = COALESCE(tax, tax_amount)';
  END IF;

  EXECUTE 'UPDATE sales SET tax = COALESCE(tax, 0)';
  EXECUTE 'ALTER TABLE sales ALTER COLUMN tax SET DEFAULT 0';

  IF NOT EXISTS (SELECT 1 FROM sales WHERE tax IS NULL) THEN
    EXECUTE 'ALTER TABLE sales ALTER COLUMN tax SET NOT NULL';
  END IF;

  -- total column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'total'
  ) INTO has_column;

  IF NOT has_column THEN
    EXECUTE 'ALTER TABLE sales ADD COLUMN total numeric(12,2)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'total_amount'
  ) INTO has_source;

  IF has_source THEN
    EXECUTE 'UPDATE sales SET total = COALESCE(total, total_amount)';
  ELSE
    EXECUTE 'UPDATE sales SET total = COALESCE(total, subtotal + COALESCE(tax, 0) - COALESCE(discount, 0))';
  END IF;

  EXECUTE 'UPDATE sales SET total = COALESCE(total, 0)';
  EXECUTE 'ALTER TABLE sales ALTER COLUMN total SET DEFAULT 0';

  IF NOT EXISTS (SELECT 1 FROM sales WHERE total IS NULL) THEN
    EXECUTE 'ALTER TABLE sales ALTER COLUMN total SET NOT NULL';
  END IF;

  -- cashier_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'cashier_id'
  ) INTO has_column;

  IF NOT has_column THEN
    EXECUTE 'ALTER TABLE sales ADD COLUMN cashier_id uuid';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'user_id'
  ) INTO has_source;

  IF has_source THEN
    EXECUTE 'UPDATE sales SET cashier_id = COALESCE(cashier_id, user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sales WHERE cashier_id IS NULL) THEN
    EXECUTE 'ALTER TABLE sales ALTER COLUMN cashier_id SET NOT NULL';
  END IF;
END $$;

COMMIT;
