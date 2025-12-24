-- Safe Migration Script for AI Analytics (v2)
-- Run this to fix missing columns for AI Profitability.

-- 1. Create Enum transaction_kind if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "transaction_kind" AS ENUM ('SALE', 'REFUND', 'ADJUSTMENT', 'SWAP_CHARGE', 'SWAP_REFUND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add "kind" column to transactions
-- Using IF NOT EXISTS to avoid errors if it was partially applied
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "kind" "transaction_kind" NOT NULL DEFAULT 'SALE';

-- 3. Create inventory_revaluation_events (Required for Stock Loss tracking)
CREATE TABLE IF NOT EXISTS "inventory_revaluation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "source" varchar(64),
  "reference_id" uuid,
  "quantity_before" integer NOT NULL,
  "quantity_after" integer NOT NULL,
  "revalued_quantity" integer,
  "avg_cost_before" decimal(12, 4),
  "avg_cost_after" decimal(12, 4),
  "total_cost_before" decimal(14, 4),
  "total_cost_after" decimal(14, 4),
  "delta_value" decimal(14, 4),
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Create ai_product_profitability (Required for Profit Analysis)
CREATE TABLE IF NOT EXISTS "ai_product_profitability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "period_days" integer DEFAULT 30 NOT NULL,
  "units_sold" integer DEFAULT 0 NOT NULL,
  "total_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
  "total_cost" decimal(14, 4) DEFAULT '0' NOT NULL,
  "total_profit" decimal(14, 2) DEFAULT '0' NOT NULL,
  "profit_margin" decimal(6, 4) DEFAULT '0' NOT NULL,
  "avg_profit_per_unit" decimal(10, 4) DEFAULT '0' NOT NULL,
  "refunded_amount" decimal(14, 2) DEFAULT '0' NOT NULL,
  "refunded_quantity" integer DEFAULT 0 NOT NULL,
  "net_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
  "gross_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
  "net_cost" decimal(14, 4) DEFAULT '0' NOT NULL,
  "sale_velocity" decimal(10, 4) DEFAULT '0' NOT NULL,
  "days_to_stockout" integer,
  "removal_count" integer DEFAULT 0 NOT NULL,
  "removal_loss_value" decimal(14, 2) DEFAULT '0' NOT NULL,
  "trend" varchar(16) DEFAULT 'stable',
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
