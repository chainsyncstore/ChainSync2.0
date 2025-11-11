-- Add products.price if it is missing, using sale_price as fallback when available
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'products'
      AND column_name  = 'price'
  ) INTO column_exists;

  IF NOT column_exists THEN
    ALTER TABLE public.products
      ADD COLUMN price NUMERIC(10, 2);

    -- Prefer existing sale_price, otherwise fall back to cost_price, default to 0
    UPDATE public.products
       SET price = COALESCE(sale_price, cost_price, 0);

    ALTER TABLE public.products
      ALTER COLUMN price SET NOT NULL,
      ALTER COLUMN price SET DEFAULT 0;
  END IF;
END $$;

-- Optional clean-up: drop legacy columns if desired (commented out)
-- ALTER TABLE public.products DROP COLUMN IF EXISTS sale_price;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS cost_price;
