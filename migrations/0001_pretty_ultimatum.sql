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
	"role" "user_role" NOT NULL,
	"store_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tier" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp;