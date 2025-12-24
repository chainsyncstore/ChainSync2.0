ALTER TABLE "ai_product_profitability"
ADD COLUMN "net_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
ADD COLUMN "gross_revenue" decimal(14, 2) DEFAULT '0' NOT NULL,
ADD COLUMN "refunded_amount" decimal(14, 2) DEFAULT '0' NOT NULL,
ADD COLUMN "refunded_quantity" integer DEFAULT 0 NOT NULL,
ADD COLUMN "net_cost" decimal(14, 4) DEFAULT '0' NOT NULL;
