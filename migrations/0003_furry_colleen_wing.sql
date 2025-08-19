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
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "subscription_provider" NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_email" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX "dunning_events_org_idx" ON "dunning_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dunning_events_subscription_idx" ON "dunning_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dunning_events_subscription_attempt_unique" ON "dunning_events" USING btree ("subscription_id","attempt");--> statement-breakpoint
CREATE INDEX "subscription_payments_org_idx" ON "subscription_payments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_provider_invoice_unique" ON "subscription_payments" USING btree ("provider","external_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_provider_reference_unique" ON "subscription_payments" USING btree ("provider","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","event_id");