CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'digital');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'voided', 'held');--> statement-breakpoint
CREATE TABLE "account_lockout_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"username" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"action" varchar(50) NOT NULL,
	"success" boolean NOT NULL,
	"reason" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"insight_type" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(50) DEFAULT 'medium',
	"data" text,
	"is_read" boolean DEFAULT false,
	"is_actioned" boolean DEFAULT false,
	"actionable" boolean DEFAULT false,
	"confidence_score" numeric(5, 2),
	"created_at" timestamp DEFAULT now(),
	"actioned_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "demand_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"predicted_demand" integer NOT NULL,
	"confidence_lower" integer,
	"confidence_upper" integer,
	"actual_demand" integer,
	"accuracy" numeric(5, 4),
	"factors" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"used_at" timestamp,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "external_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"factor_type" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"impact" varchar(50) DEFAULT 'neutral',
	"impact_strength" numeric(3, 2) DEFAULT '0.00',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forecast_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"model_type" varchar(100) NOT NULL,
	"parameters" text,
	"accuracy" numeric(5, 4),
	"is_active" boolean DEFAULT true,
	"last_trained" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ip_whitelist_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_id" uuid,
	"username" varchar(255),
	"action" varchar(50) NOT NULL,
	"success" boolean NOT NULL,
	"reason" varchar(255),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ip_whitelists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"description" varchar(255),
	"whitelisted_by" uuid NOT NULL,
	"whitelisted_for" uuid NOT NULL,
	"role" "role" NOT NULL,
	"store_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "low_stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"current_stock" integer NOT NULL,
	"min_stock_level" integer NOT NULL,
	"is_resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "loyalty_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"points_required" integer DEFAULT 0 NOT NULL,
	"discount_percentage" numeric(5, 2) DEFAULT '0.00',
	"color" varchar(50) DEFAULT '#6B7280',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid,
	"type" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"priority" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "phone_verification_otp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" varchar(50) NOT NULL,
	"otp_hash" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"created_at" timestamp DEFAULT now(),
	"verified_at" timestamp,
	"is_verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "seasonal_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid,
	"pattern_type" varchar(100) NOT NULL,
	"season" varchar(50),
	"day_of_week" integer,
	"month" integer,
	"average_demand" integer NOT NULL,
	"confidence" numeric(5, 4),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"action" varchar(50) NOT NULL,
	"data" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"cashier_id" uuid NOT NULL,
	"status" "transaction_status" DEFAULT 'pending',
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_amount" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"amount_received" numeric(10, 2),
	"change_due" numeric(10, 2),
	"receipt_number" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	CONSTRAINT "transactions_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"refresh_token" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"refresh_expires_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp DEFAULT now(),
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "user_sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "user_store_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "websocket_connections" (
	"connection_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"is_active" boolean DEFAULT true,
	"connected_at" timestamp DEFAULT now(),
	"last_activity" timestamp DEFAULT now(),
	"disconnected_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dunning_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ip_whitelist" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_changes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "returns" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_alerts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "audit_logs" CASCADE;--> statement-breakpoint
DROP TABLE "dunning_events" CASCADE;--> statement-breakpoint
DROP TABLE "ip_whitelist" CASCADE;--> statement-breakpoint
DROP TABLE "loyalty_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "organizations" CASCADE;--> statement-breakpoint
DROP TABLE "price_changes" CASCADE;--> statement-breakpoint
DROP TABLE "returns" CASCADE;--> statement-breakpoint
DROP TABLE "sale_items" CASCADE;--> statement-breakpoint
DROP TABLE "sales" CASCADE;--> statement-breakpoint
DROP TABLE "stock_alerts" CASCADE;--> statement-breakpoint
DROP TABLE "webhook_events" CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'trial'::text;--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'suspended');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'trial'::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."subscription_status" USING "status"::"public"."subscription_status";--> statement-breakpoint
DROP INDEX "customers_org_phone_unique";--> statement-breakpoint
DROP INDEX "customers_org_idx";--> statement-breakpoint
DROP INDEX "inventory_store_idx";--> statement-breakpoint
DROP INDEX "inventory_product_idx";--> statement-breakpoint
DROP INDEX "inventory_store_product_unique";--> statement-breakpoint
DROP INDEX "loyalty_tx_account_idx";--> statement-breakpoint
DROP INDEX "products_org_idx";--> statement-breakpoint
DROP INDEX "products_org_sku_unique";--> statement-breakpoint
DROP INDEX "stores_org_idx";--> statement-breakpoint
DROP INDEX "subscription_payments_org_idx";--> statement-breakpoint
DROP INDEX "subscription_payments_provider_invoice_unique";--> statement-breakpoint
DROP INDEX "subscription_payments_provider_reference_unique";--> statement-breakpoint
DROP INDEX "subscriptions_org_idx";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sku" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sku" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "barcode" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_payments" ALTER COLUMN "provider" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "subscription_payments" ALTER COLUMN "amount" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_payments" ALTER COLUMN "currency" SET DATA TYPE varchar(3);--> statement-breakpoint
ALTER TABLE "subscription_payments" ALTER COLUMN "status" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "store_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "loyalty_number" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "current_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lifetime_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tier_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "min_stock_level" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "max_stock_level" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "last_restocked" timestamp;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "customer_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "transaction_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "points_earned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "points_before" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "points_after" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "tier_before" uuid;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "tier_after" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" varchar(255);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" varchar(255);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "tax_rate" numeric(5, 4) DEFAULT '0.085';--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "subscription_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "payment_reference" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "payment_type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "tier" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upfront_fee_paid" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upfront_fee_currency" varchar(3) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "monthly_amount" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "monthly_currency" varchar(3) NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_start_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_end_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "next_billing_date" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "upfront_fee_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "low_stock_email_opt_out" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_completed" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_attempts" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" varchar(255);--> statement-breakpoint
CREATE INDEX "account_lockout_logs_user_id_idx" ON "account_lockout_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_lockout_logs_ip_address_idx" ON "account_lockout_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "account_lockout_logs_created_at_idx" ON "account_lockout_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_lockout_logs_action_idx" ON "account_lockout_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ai_insights_store_id_idx" ON "ai_insights" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "demand_forecasts_store_id_idx" ON "demand_forecasts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "demand_forecasts_product_id_idx" ON "demand_forecasts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "demand_forecasts_model_id_idx" ON "demand_forecasts" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "demand_forecasts_forecast_date_idx" ON "demand_forecasts" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "external_factors_store_id_idx" ON "external_factors" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "forecast_models_store_id_idx" ON "forecast_models" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "ip_whitelist_logs_ip_address_idx" ON "ip_whitelist_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_whitelist_logs_user_id_idx" ON "ip_whitelist_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ip_whitelists_ip_address_idx" ON "ip_whitelists" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_whitelists_whitelisted_by_idx" ON "ip_whitelists" USING btree ("whitelisted_by");--> statement-breakpoint
CREATE INDEX "ip_whitelists_whitelisted_for_idx" ON "ip_whitelists" USING btree ("whitelisted_for");--> statement-breakpoint
CREATE INDEX "ip_whitelists_store_id_idx" ON "ip_whitelists" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "low_stock_alerts_store_id_idx" ON "low_stock_alerts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "low_stock_alerts_product_id_idx" ON "low_stock_alerts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "loyalty_tiers_store_id_idx" ON "loyalty_tiers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "phone_verification_otp_user_id_idx" ON "phone_verification_otp" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "phone_verification_otp_phone_idx" ON "phone_verification_otp" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "phone_verification_otp_expires_at_idx" ON "phone_verification_otp" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "seasonal_patterns_store_id_idx" ON "seasonal_patterns" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "seasonal_patterns_product_id_idx" ON "seasonal_patterns" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "session_expire_idx" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_items_product_id_idx" ON "transaction_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "transactions_store_id_idx" ON "transactions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "transactions_cashier_id_idx" ON "transactions" USING btree ("cashier_id");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_session_token_idx" ON "user_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "user_sessions_refresh_token_idx" ON "user_sessions" USING btree ("refresh_token");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_sessions_is_active_idx" ON "user_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "user_store_permissions_user_id_idx" ON "user_store_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_store_permissions_store_id_idx" ON "user_store_permissions" USING btree ("store_id");--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_store_id_idx" ON "customers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_store_id_idx" ON "inventory" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_product_id_idx" ON "inventory" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "loyalty_transactions_customer_id_idx" ON "loyalty_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_transactions_transaction_id_idx" ON "loyalty_transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_reference_idx" ON "subscription_payments" USING btree ("payment_reference");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_trial_end_date_idx" ON "subscriptions" USING btree ("trial_end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_store_idx" ON "users" USING btree ("store_id");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN "reorder_level";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "loyalty_account_id";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "points";--> statement-breakpoint
ALTER TABLE "loyalty_transactions" DROP COLUMN "reason";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "cost_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "sale_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "vat_rate";--> statement-breakpoint
ALTER TABLE "stores" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "plan_code";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "external_sub_id";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "external_invoice_id";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "reference";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "event_type";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "occurred_at";--> statement-breakpoint
ALTER TABLE "subscription_payments" DROP COLUMN "raw";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "plan_code";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "external_customer_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "external_sub_id";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "started_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "current_period_end";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "last_event_raw";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_loyalty_number_unique" UNIQUE("loyalty_number");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sku_unique" UNIQUE("sku");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_unique" UNIQUE("barcode");--> statement-breakpoint
DROP TYPE "public"."sale_status";--> statement-breakpoint
DROP TYPE "public"."subscription_provider";