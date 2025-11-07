import { readFile } from "node:fs/promises";
import { Client } from "pg";

const sql = await readFile(
  "migrations/0008_add_subscription_id_to_users.sql",
  "utf8"
);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Please export it before running this script.");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("users.subscription_id column ensured.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to apply users.subscription_id migration:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
