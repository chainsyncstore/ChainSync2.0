import { Client } from 'pg';

const DATABASE_URL = "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function testConnection() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('🔌 Testing database connection...');
    await client.connect();
    console.log('✅ Database connection successful!');

    // Test a simple query
    const result = await client.query('SELECT COUNT(*) FROM users');
    console.log(`📊 Users table has ${result.rows[0].count} records`);

    // Check if we can insert a test user
    const testUser = {
      email: `test${Date.now()}@example.com`,
      password_hash: 'test_hash',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin',
      is_active: true,
      email_verified: false
    };

    const insertResult = await client.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [testUser.email, testUser.password_hash, testUser.first_name, testUser.last_name, testUser.role, testUser.is_active, testUser.email_verified]
    );

    console.log(`✅ Test user created with ID: ${insertResult.rows[0].id}`);

    // Clean up test user
    await client.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    console.log('🧹 Test user cleaned up');

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await client.end();
  }
}

testConnection();
