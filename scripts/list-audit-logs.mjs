import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT count(*) AS count FROM audit_logs;"
    );
    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to query audit_logs:", error);
  process.exit(1);
});
