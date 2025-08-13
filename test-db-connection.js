const { Pool } = require('pg');
require('dotenv/config');

console.log('🔍 Testing database connection...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Database URL exists:', !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

// Test database connection
const testConnection = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false,
      require: true
    } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });

  try {
    console.log('🔄 Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Connected successfully!');
    
    const result = await client.query('SELECT NOW() as current_time');
    console.log('📊 Query result:', result.rows[0]);
    
    client.release();
    await pool.end();
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Full error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 This usually means the database server is not accessible');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 This usually means the hostname cannot be resolved');
    } else if (error.code === '28P01') {
      console.error('💡 Authentication failed - check username/password');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist');
    }
    
    process.exit(1);
  }
};

testConnection();
