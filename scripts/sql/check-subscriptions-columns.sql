-- Inspect the subscriptions table for columns expected by the application
SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'subscriptions'
  AND column_name IN (
    'plan_code',
    'tier',
    'status',
    'autopay_enabled',
    'autopay_provider',
    'autopay_reference',
    'trial_start_date',
    'trial_end_date',
    'created_at',
    'updated_at'
  )
ORDER BY column_name;

-- Preview current subscription rows to help with backfill planning
SELECT id,
       org_id,
       plan_code,
       status,
       created_at,
       updated_at
FROM public.subscriptions
ORDER BY created_at DESC NULLS LAST
LIMIT 20;
