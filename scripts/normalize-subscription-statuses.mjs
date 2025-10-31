import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    const result = await client.query(
      "UPDATE subscriptions SET status = LOWER(status::text)::subscription_status WHERE status::text <> LOWER(status::text);"
    );
    console.log(`Normalized ${result.rowCount} subscription record(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to normalize subscription statuses:", error);
  process.exit(1);
});
