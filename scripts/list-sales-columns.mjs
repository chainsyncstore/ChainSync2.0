import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales'
        ORDER BY ordinal_position`
    );
    console.table(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to list sales columns:", error);
  process.exit(1);
});
