import { Pool } from 'pg';
import 'dotenv/config';

async function verifyData() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log("Verifying seeded data...");

    const stores = await client.query('SELECT * FROM stores');
    console.log(`✅ Found ${stores.rowCount} stores.`);

    const users = await client.query('SELECT * FROM users');
    console.log(`✅ Found ${users.rowCount} users.`);

    const products = await client.query('SELECT * FROM products');
    console.log(`✅ Found ${products.rowCount} products.`);

    const inventory = await client.query('SELECT * FROM inventory');
    console.log(`✅ Found ${inventory.rowCount} inventory items.`);

    const loyaltyTiers = await client.query('SELECT * FROM loyalty_tiers');
    console.log(`✅ Found ${loyaltyTiers.rowCount} loyalty tiers.`);

    const customers = await client.query('SELECT * FROM customers');
    console.log(`✅ Found ${customers.rowCount} customers.`);

    console.log("✅ Data verification complete.");
  } catch (error) {
    console.error("❌ Error verifying data:", error);
  } finally {
    await client.release();
    await pool.end();
  }
}

verifyData().catch((error) => {
  console.error("❌ Unexpected error verifying data:", error);
  process.exit(1);
});
