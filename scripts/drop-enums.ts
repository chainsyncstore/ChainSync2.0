import { Pool } from 'pg';
import 'dotenv/config';

async function dropEnums() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log("Dropping all enums...");

    const res = await client.query(`
      SELECT t.typname AS enum_name
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname;
    `);

    const enumNames = res.rows.map(row => row.enum_name);

    for (const enumName of enumNames) {
      console.log(`Dropping enum: ${enumName}`);
      await client.query(`DROP TYPE IF EXISTS "${enumName}" CASCADE;`);
    }

    console.log("✅ All enums dropped successfully.");
  } catch (error) {
    console.error("❌ Error dropping enums:", error);
  } finally {
    await client.release();
    await pool.end();
  }
}

dropEnums().catch((error) => {
  console.error('❌ Unhandled error while dropping enums:', error);
  process.exit(1);
});
