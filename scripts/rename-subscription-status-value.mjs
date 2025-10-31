import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("ALTER TYPE subscription_status RENAME VALUE 'ACTIVE' TO 'active';");
    console.log("subscription_status enum label renamed.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to rename subscription_status enum value:", error);
  process.exit(1);
});