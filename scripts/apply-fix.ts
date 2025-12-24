
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function main() {
    console.log('🚀 Starting Schema Fix Application...');

    // 1. Transactions Table Fixes
    console.log('🔧 Fixing "transactions" table...');
    try {
        // Enum
        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE transaction_kind AS ENUM ('SALE', 'REFUND', 'ADJUSTMENT', 'SWAP_CHARGE', 'SWAP_REFUND');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Columns
        const transactionCols = [
            'ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "kind" "transaction_kind" NOT NULL DEFAULT \'SALE\'',
            'ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "origin_transaction_id" uuid',
            'ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source" varchar(64) NOT NULL DEFAULT \'pos\'',
            'ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "import_batch_id" uuid'
        ];

        for (const cmd of transactionCols) {
            await db.execute(sql.raw(cmd));
        }
        console.log('  ✅ Transactions table fixed.');
    } catch (e) {
        console.error('  ❌ Error fixing transactions:', e);
    }

    // 2. Sales Table Fixes
    console.log('🔧 Fixing "sales" table...');
    try {
        const salesCols = [
            'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "wallet_reference" varchar(255)',
            'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "payment_breakdown" jsonb'
        ];
        for (const cmd of salesCols) {
            await db.execute(sql.raw(cmd));
        }
        console.log('  ✅ Sales table fixed.');
    } catch (e) {
        console.error('  ❌ Error fixing sales:', e);
    }

    // 2b. Transaction Items Fixes
    console.log('🔧 Fixing "transaction_items" table...');
    try {
        const itemCols = [
            'ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "unit_cost" decimal(12, 4) NOT NULL DEFAULT \'0\'',
            'ALTER TABLE "transaction_items" ADD COLUMN IF NOT EXISTS "total_cost" decimal(14, 4) NOT NULL DEFAULT \'0\''
        ];
        for (const cmd of itemCols) {
            await db.execute(sql.raw(cmd));
        }
        console.log('  ✅ transaction_items table fixed.');
    } catch (e) {
        console.error('  ❌ Error fixing transaction_items:', e);
    }

    // 3. Create Missing Tables (AI & Features)
    console.log('🔧 Creating missing tables...');
    const tables = [
        `CREATE TABLE IF NOT EXISTS "ai_product_profitability" (
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
        )`,
        `CREATE TABLE IF NOT EXISTS "inventory_revaluation_events" (
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
        )`,
        `CREATE TABLE IF NOT EXISTS "store_performance_alerts" (
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
        )`,
        `CREATE TABLE IF NOT EXISTS "ai_batch_runs" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
          "status" varchar(16) DEFAULT 'pending' NOT NULL,
          "stores_processed" integer DEFAULT 0 NOT NULL,
          "insights_generated" integer DEFAULT 0 NOT NULL,
          "started_at" timestamp with time zone,
          "completed_at" timestamp with time zone,
          "error_message" text,
          "created_at" timestamp with time zone DEFAULT now()
        )`
    ];

    for (const sqlQuery of tables) {
        try {
            await db.execute(sql.raw(sqlQuery));
        } catch (e) {
            console.error('  ❌ Error creating table:', e);
        }
    }
    console.log('  ✅ Missing tables created.');

    console.log('✨ Done. You should now be able to run the verification script.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
