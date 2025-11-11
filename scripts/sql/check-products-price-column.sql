-- Check whether the products.price column exists and gather related metadata
SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name IN ('price', 'sale_price', 'cost_price')
ORDER BY column_name;

-- Display a few sample rows to verify data availability
SELECT id,
       name,
       price,
       sale_price,
       cost_price
FROM public.products
ORDER BY created_at DESC
LIMIT 10;
