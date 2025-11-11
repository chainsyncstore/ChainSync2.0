-- Update a specific org's subscription to the enterprise plan
-- Replace the placeholders before running:
--   :org_id        -> target organization UUID
--   :subscription_id -> subscription UUID (if you prefer filtering directly)
--
-- Example usage:
--   psql "$DATABASE_URL" -v org_id="00000000-0000-0000-0000-000000000000" -f scripts/sql/set-subscription-plan-enterprise.sql

BEGIN;

-- Ensure the org has a subscription row; adjust filter as needed
UPDATE public.subscriptions
   SET plan_code = 'enterprise',
       tier = 'enterprise',
       status = COALESCE(status, 'ACTIVE'),
       updated_at = NOW()
 WHERE org_id = :'org_id'
    OR id = :'subscription_id';

-- Optional: verify the result
SELECT id,
       org_id,
       plan_code,
       tier,
       status,
       created_at,
       updated_at
  FROM public.subscriptions
 WHERE org_id = :'org_id'
    OR id = :'subscription_id';

COMMIT;
