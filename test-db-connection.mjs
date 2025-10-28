import { Client } from 'pg';

async function testConnection() {
  const url = process.env.DATABASE_URL;
  const client = new Client({ connectionString: url });
  try {
    console.log('🔌 Testing database connection...');
    await client.connect();
    console.log('✅ Database connection successful!');
    const result = await client.query('SELECT 1 as ok');
    console.log(`📊 Simple query result: ${result.rows[0].ok}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error?.message || String(error));
  } finally {
    await client.end();
  }
}

testConnection();
