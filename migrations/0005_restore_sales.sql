CREATE TABLE IF NOT EXISTS "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"register_id" uuid,
	"user_id" uuid,
	"payment_id" uuid,
	"order_number" varchar(64),
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0'::numeric,
	"discount_amount" numeric(12, 2) DEFAULT '0'::numeric,
	"payment_method" varchar(32),
	"status" varchar(32) DEFAULT 'completed',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"idempotency_key" varchar(255),
	"currency" varchar(3) DEFAULT 'USD',
	"org_region" varchar(32),
	"store_name" varchar(255),
	"customer_id" uuid,
	"customer_name" varchar(255),
	"notes" text,
	"subtotal" numeric(12, 2) DEFAULT '0'::numeric,
	"change_due" numeric(12, 2) DEFAULT '0'::numeric,
	"tip_amount" numeric(12, 2) DEFAULT '0'::numeric
);

CREATE INDEX IF NOT EXISTS "sales_org_idx" ON "sales" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "sales_store_idx" ON "sales" USING btree ("store_id");
CREATE INDEX IF NOT EXISTS "sales_occurred_idx" ON "sales" USING btree ("occurred_at");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_idempotency_unique" ON "sales" USING btree ("idempotency_key");
