-- ============================================================================
-- DIAGNOSE RETURNS FLOW - Check all required columns exist
-- ============================================================================

-- 1. Check sales table has 'status' column
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'sales' AND column_name = 'status';

-- 2. Check transactions table has required columns
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
  AND column_name IN ('origin_transaction_id', 'source', 'import_batch_id', 'completed_at', 'kind')
ORDER BY column_name;

-- 3. Check returns table exists and has all columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'returns'
ORDER BY ordinal_position;

-- 4. Check return_items table exists and has all columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'return_items'
ORDER BY ordinal_position;

-- 5. Check if sale_status enum exists and has RETURNED value
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status');

-- 6. Check if transaction_kind enum exists and has REFUND value
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_kind');
