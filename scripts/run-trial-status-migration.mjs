import { readFile } from "node:fs/promises";
import { Client } from "pg";

const sql = await readFile("migrations/0007_add_trial_status.sql", "utf8");
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  await client.query(sql);
  console.log("Migration applied.");
} finally {
  await client.end();
}