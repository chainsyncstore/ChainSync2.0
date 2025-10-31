import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT DISTINCT status FROM subscriptions ORDER BY status;"
    );
    console.log("Distinct subscription statuses:", rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to fetch subscription statuses:", error);
  process.exit(1);
});
