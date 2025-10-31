import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT id, status FROM subscriptions WHERE user_id IS NULL;"
    );

    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to list subscriptions with null user_id:", error);
  process.exit(1);
});