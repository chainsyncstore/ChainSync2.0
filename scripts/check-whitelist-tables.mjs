import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT to_regclass('public.ip_whitelists') AS ip_whitelists, to_regclass('public.ip_whitelist_logs') AS ip_whitelist_logs;"
    );
    console.log(rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to check whitelist tables:", error);
  process.exit(1);
});