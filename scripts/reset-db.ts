import { Pool } from 'pg';
import 'dotenv/config';

async function resetDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log("Dropping all tables...");

    // Get all table names
    const res = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);

    const tableNames = res.rows.map(row => row.tablename);

    // Drop all tables
    for (const tableName of tableNames) {
      if(tableName !== '__drizzle_migrations') {
        console.log(`Dropping table: ${tableName}`);
        await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
      }
    }

    console.log("✅ All tables dropped successfully.");
  } catch (error) {
    console.error("❌ Error dropping tables:", error);
  } finally {
    await client.release();
    await pool.end();
  }
}

resetDatabase();
