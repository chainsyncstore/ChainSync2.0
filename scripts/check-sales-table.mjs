import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT to_regclass('public.sales') AS sales;"
    );
    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to verify sales table:", error);
  process.exit(1);
});