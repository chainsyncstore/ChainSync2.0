-- Add currency to public.stores (app schema)
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'USD';

-- Backfill NULLs to default (in case column existed without default)
UPDATE "stores" SET "currency" = 'USD' WHERE "currency" IS NULL;

-- Add currency to prd stores (multi-tenant org schema)
ALTER TABLE IF EXISTS "stores" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'NGN';
-- Note: The above targets the current search_path. If your production uses a separate schema, ensure correct schema is used.
UPDATE "stores" SET "currency" = COALESCE("currency", 'NGN');


