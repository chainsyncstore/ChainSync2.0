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
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone" varchar(32) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dunning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status" varchar(32) NOT NULL,
	"reason" text,
	"sent_at" timestamp with time zone DEFAULT now(),
	"next_attempt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL
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
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loyalty_account_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"locked_until" timestamp with time zone,
	"billing_email" varchar(255),
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
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" varchar(128) NOT NULL,
	"barcode" varchar(128),
	"name" varchar(255) NOT NULL,
	"cost_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sale_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
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
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"currency" varchar(3) DEFAULT 'NGN',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "subscription_provider" NOT NULL,
	"plan_code" varchar(128) NOT NULL,
	"external_sub_id" varchar(255),
	"external_invoice_id" varchar(255),
	"reference" varchar(255),
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"status" varchar(32) NOT NULL,
	"event_type" varchar(64),
	"occurred_at" timestamp with time zone DEFAULT now(),
	"raw" jsonb
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
	"last_event_raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
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
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"requires_2fa" boolean DEFAULT false NOT NULL,
	"totp_secret" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"last_login_at" timestamp with time zone,
	"email_verified" boolean DEFAULT false,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "subscription_provider" NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_phone_unique" ON "customers" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dunning_events_org_idx" ON "dunning_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dunning_events_subscription_idx" ON "dunning_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dunning_events_subscription_attempt_unique" ON "dunning_events" USING btree ("subscription_id","attempt");--> statement-breakpoint
CREATE INDEX "inventory_store_idx" ON "inventory" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_product_idx" ON "inventory" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_store_product_unique" ON "inventory" USING btree ("store_id","product_id");--> statement-breakpoint
CREATE INDEX "ip_whitelist_org_idx" ON "ip_whitelist" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "loyalty_accounts_org_idx" ON "loyalty_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_accounts_customer_unique" ON "loyalty_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_tx_account_idx" ON "loyalty_transactions" USING btree ("loyalty_account_id");--> statement-breakpoint
CREATE INDEX "price_changes_org_idx" ON "price_changes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_unique" ON "products" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_idx" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_org_idx" ON "sales" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sales_store_idx" ON "sales" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sales_occurred_idx" ON "sales" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_unique" ON "sales" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_alerts_store_idx" ON "stock_alerts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stock_alerts_product_idx" ON "stock_alerts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stores_org_idx" ON "stores" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_org_idx" ON "subscription_payments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_provider_invoice_unique" ON "subscription_payments" USING btree ("provider","external_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_provider_reference_unique" ON "subscription_payments" USING btree ("provider","reference");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_org_idx" ON "user_roles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_roles_store_idx" ON "user_roles" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique_scope" ON "user_roles" USING btree ("user_id","store_id","role");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","event_id");