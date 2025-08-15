CREATE TYPE "public"."role" AS ENUM('ADMIN', 'MANAGER', 'CASHIER');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('COMPLETED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."subscription_provider" AS ENUM('PAYSTACK', 'FLW');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" uuid,
	"meta" jsonb,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ip_whitelist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"cidr_or_ip" varchar(64) NOT NULL,
	"label" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"tier" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid,
	"product_id" uuid,
	"old_price" numeric(12, 2) NOT NULL,
	"new_price" numeric(12, 2) NOT NULL,
	"initiated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"reason" text,
	"processed_by" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"cashier_id" uuid NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"payment_method" text DEFAULT 'manual' NOT NULL,
	"status" "sale_status" DEFAULT 'COMPLETED' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"current_qty" integer NOT NULL,
	"reorder_level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "subscription_provider" NOT NULL,
	"plan_code" varchar(128) NOT NULL,
	"status" "subscription_status" NOT NULL,
	"external_customer_id" varchar(255),
	"external_sub_id" varchar(255),
	"started_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"last_event_raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid,
	"role" "role" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insights" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_forecasts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_factors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_models" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ip_whitelist_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ip_whitelists" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "low_stock_alerts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_tiers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seasonal_patterns" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transaction_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_store_permissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ai_insights" CASCADE;--> statement-breakpoint
DROP TABLE "demand_forecasts" CASCADE;--> statement-breakpoint
DROP TABLE "external_factors" CASCADE;--> statement-breakpoint
DROP TABLE "forecast_models" CASCADE;--> statement-breakpoint
DROP TABLE "ip_whitelist_logs" CASCADE;--> statement-breakpoint
DROP TABLE "ip_whitelists" CASCADE;--> statement-breakpoint
DROP TABLE "low_stock_alerts" CASCADE;--> statement-breakpoint
DROP TABLE "loyalty_tiers" CASCADE;--> statement-breakpoint
DROP TABLE "seasonal_patterns" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "transaction_items" CASCADE;--> statement-breakpoint
DROP TABLE "transactions" CASCADE;--> statement-breakpoint
DROP TABLE "user_store_permissions" CASCADE;--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_loyalty_number_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_sku_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_barcode_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sku" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "barcode" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "reorder_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "loyalty_account_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "points" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "reason" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vat_rate" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "requires_2fa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ip_whitelist_org_idx" ON "ip_whitelist" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "loyalty_accounts_org_idx" ON "loyalty_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_accounts_customer_unique" ON "loyalty_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "price_changes_org_idx" ON "price_changes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_idx" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_org_idx" ON "sales" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sales_store_idx" ON "sales" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sales_occurred_idx" ON "sales" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_unique" ON "sales" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_alerts_store_idx" ON "stock_alerts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stock_alerts_product_idx" ON "stock_alerts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_org_idx" ON "user_roles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_roles_store_idx" ON "user_roles" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique_scope" ON "user_roles" USING btree ("user_id","store_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_phone_unique" ON "customers" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inventory_store_idx" ON "inventory" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_product_idx" ON "inventory" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_store_product_unique" ON "inventory" USING btree ("store_id","product_id");--> statement-breakpoint
CREATE INDEX "loyalty_tx_account_idx" ON "loyalty_transactions" USING btree ("loyalty_account_id");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_unique" ON "products" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "stores_org_idx" ON "stores" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "last_name";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "loyalty_number";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "current_points";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "lifetime_points";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "tier_id";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN "min_stock_level";--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN "max_stock_level";--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN "last_restocked";--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "transaction_id";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "points_earned";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "points_redeemed";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "points_before";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "points_after";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "tier_before";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "tier_after";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "cost";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "brand";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "tax_rate";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "last_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "company_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "tier";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "trial_ends_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "updated_at";--> statement-breakpoint
DROP TYPE "public"."payment_method";--> statement-breakpoint
DROP TYPE "public"."transaction_status";--> statement-breakpoint
DROP TYPE "public"."user_role";