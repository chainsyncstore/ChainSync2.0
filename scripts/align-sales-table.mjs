import { Client } from "pg";

const SQL = `
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "cashier_id" uuid,
  ADD COLUMN IF NOT EXISTS "subtotal" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "discount" numeric(12, 2) DEFAULT '0'::numeric,
  ADD COLUMN IF NOT EXISTS "tax" numeric(12, 2) DEFAULT '0'::numeric,
  ADD COLUMN IF NOT EXISTS "total" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "payment_method" text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "status" sale_status DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);

ALTER TABLE "sales"
  ALTER COLUMN "subtotal" SET NOT NULL,
  ALTER COLUMN "discount" SET NOT NULL,
  ALTER COLUMN "tax" SET NOT NULL,
  ALTER COLUMN "total" SET NOT NULL,
  ALTER COLUMN "payment_method" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "idempotency_key" SET NOT NULL;
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log("sales table aligned with expected schema");
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to align sales table schema:", error);
  process.exit(1);
});
