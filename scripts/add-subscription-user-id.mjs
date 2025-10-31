import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(
      "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;"
    );
    console.log("user_id column ensured on subscriptions.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to add user_id column:", error);
  process.exit(1);
});