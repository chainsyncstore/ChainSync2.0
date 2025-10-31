import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY ordinal_position;"
    );
    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to list subscription columns:", error);
  process.exit(1);
});