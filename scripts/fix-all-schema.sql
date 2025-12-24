-- Comprehensive Schema Fix Script (v2)
-- Run this to fix ALL missing columns and tables detected in the user environment.
-- This script is idempotent (safe to run multiple times).

-- ==========================================
-- 1. Transactions Table Fixes (Critical)
-- ==========================================
DO $$ BEGIN
    CREATE TYPE "transaction_kind" AS ENUM ('SALE', 'REFUND', 'ADJUSTMENT', 'SWAP_CHARGE', 'SWAP_REFUND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "kind" "transaction_kind" NOT NULL DEFAULT 'SALE';
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "origin_transaction_id" uuid;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source" varchar(64) NOT NULL DEFAULT 'pos';
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "import_batch_id" uuid;

-- ==========================================
-- 2. Sales Table Fixes (Legacy Support)
-- ==========================================
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "wallet_reference" varchar(255);
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "payment_breakdown" jsonb;

-- ==========================================
-- 2b. Transaction Items Fixes (Analytics)
-- ==========================================
ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "unit_cost" decimal(12, 4) NOT NULL DEFAULT '0';
ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "total_cost" decimal(14, 4) NOT NULL DEFAULT '0';

-- ==========================================
-- 3. AI & Analytics Tables (New Features)
-- ==========================================
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

CREATE TABLE IF NOT EXISTS "store_performance_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "timeframe" varchar(32) DEFAULT 'daily' NOT NULL,
  "comparison_window" varchar(64) DEFAULT 'previous_7_days' NOT NULL,
  "gross_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
  "net_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
  "transactions_count" integer DEFAULT 0 NOT NULL,
  "average_order_value" decimal(14, 2) DEFAULT '0' NOT NULL,
  "baseline_revenue" decimal(14, 2),
  "baseline_transactions" decimal(14, 2),
  "revenue_delta_pct" decimal(6, 2),
  "transactions_delta_pct" decimal(6, 2),
  "refund_ratio" decimal(6, 2),
  "top_product" jsonb,
  "severity" varchar(16) DEFAULT 'low' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

-- ==========================================
-- 4. New Utility Tables (Notifications, etc)
-- ==========================================
CREATE TABLE IF NOT EXISTS "return_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "return_id" uuid NOT NULL,
  "sale_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "restock_action" varchar(16) NOT NULL,
  "refund_type" varchar(16) NOT NULL,
  "refund_amount" decimal(10, 2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "notes" text
);

CREATE TABLE IF NOT EXISTS "price_change_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "org_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "source" varchar(64),
  "reference_id" uuid,
  "old_cost" decimal(12, 4),
  "new_cost" decimal(12, 4),
  "old_sale_price" decimal(12, 4),
  "new_sale_price" decimal(12, 4),
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "profile_update_otps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "code" varchar(10) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid,
  "store_id" uuid,
  "user_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "interval" varchar(32) DEFAULT 'daily' NOT NULL,
  "params" jsonb,
  "last_run_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "quantity_before" integer DEFAULT 0 NOT NULL,
  "quantity_after" integer DEFAULT 0 NOT NULL,
  "delta" integer NOT NULL,
  "action_type" varchar(32) NOT NULL,
  "source" varchar(64),
  "reference_id" uuid,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "notes" text,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ai_batch_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "stores_processed" integer DEFAULT 0 NOT NULL,
  "insights_generated" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now()
);

-- ==========================================
-- 5. AI Insight Columns
-- ==========================================
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "is_actionable" boolean DEFAULT false NOT NULL;
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "is_dismissed" boolean DEFAULT false NOT NULL;
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp with time zone;
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "dismissed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "generated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "ai_insights" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
