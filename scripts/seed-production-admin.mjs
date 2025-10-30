import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createProductionAdmin() {
  const email = 'admin@chainsync.com';
  const password = 'Admin123!'; // Change this after first login!
  
  try {
    const client = await pool.connect();
    console.log('✅ Connected to production database');
    
    // Check if admin exists
    const existingResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`Admin user exists, updating password...`);
      const passwordHash = await bcrypt.hash(password, 10);
      
      await client.query(
        `UPDATE users 
         SET password_hash = $1, is_admin = true, email_verified = true 
         WHERE email = $2`,
        [passwordHash, email]
      );
      
      console.log('✅ Admin password updated!');
    } else {
      // Create new admin
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await client.query(
        `INSERT INTO users (
          email, password_hash, is_admin, email_verified, requires_2fa, created_at
        ) VALUES ($1, $2, true, true, false, NOW())
        RETURNING id, email`,
        [email, passwordHash]
      );
      
      console.log('✅ Admin user created!');
      console.log('User ID:', result.rows[0].id);
    }
    
    console.log('\n📧 Login credentials:');
    console.log('----------------------------------------------');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('----------------------------------------------');
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    
    client.release();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.detail) console.error('Details:', err.detail);
  } finally {
    await pool.end();
  }
}

// Only run if DATABASE_URL is set
if (process.env.DATABASE_URL) {
  console.log('🔧 Setting up production admin user...');
  createProductionAdmin();
} else {
  console.error('❌ DATABASE_URL not set!');
  console.error('Please set DATABASE_URL environment variable to your production database URL');
  process.exit(1);
}
