import { Client } from "pg";

const SQL = `
CREATE TABLE IF NOT EXISTS "audit_logs" (
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

CREATE INDEX IF NOT EXISTS "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(SQL);
    console.log("audit_logs table restored");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to restore audit_logs table:", error);
  process.exit(1);
});
