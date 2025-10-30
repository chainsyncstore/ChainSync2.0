import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function checkAllAdmins() {
  const client = await pool.connect();
  
  console.log('🔍 Checking ALL admin users in database...\n');
  
  // Get ALL users that might be admins
  const result = await client.query(`
    SELECT id, email, is_admin, email_verified, created_at, 
           CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password
    FROM users 
    WHERE is_admin = true OR email LIKE '%admin%' OR email LIKE '%chainsync%'
    ORDER BY created_at DESC
  `);
  
  console.log(`Found ${result.rows.length} potential admin users:\n`);
  console.log('=' .repeat(80));
  
  for (const user of result.rows) {
    console.log(`Email: ${user.email}`);
    console.log(`  - ID: ${user.id}`);
    console.log(`  - Is Admin: ${user.is_admin}`);
    console.log(`  - Email Verified: ${user.email_verified}`);
    console.log(`  - Has Password: ${user.has_password}`);
    console.log(`  - Created: ${user.created_at}`);
    console.log('-'.repeat(40));
  }
  
  console.log('\n🔐 Testing login for admin@chainsync.com with Admin123!...');
  const adminUser = await client.query(
    'SELECT password_hash FROM users WHERE email = $1',
    ['admin@chainsync.com']
  );
  
  if (adminUser.rows.length > 0 && adminUser.rows[0].password_hash) {
    const isValid = await bcrypt.compare('Admin123!', adminUser.rows[0].password_hash);
    console.log(`Password Admin123! is ${isValid ? '✅ VALID' : '❌ INVALID'} for admin@chainsync.com`);
  } else {
    console.log('❌ admin@chainsync.com not found or has no password');
  }
  
  console.log('\n🔧 FIXING: Setting admin@chainsync.com as the primary admin...');
  
  // Create or update the correct admin
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  
  await client.query(`
    INSERT INTO users (email, password_hash, is_admin, email_verified, requires_2fa, created_at)
    VALUES ($1, $2, true, true, false, NOW())
    ON CONFLICT (email) 
    DO UPDATE SET 
      password_hash = $2,
      is_admin = true,
      email_verified = true
    RETURNING id
  `, ['admin@chainsync.com', passwordHash]);
  
  console.log('✅ admin@chainsync.com is now ready with password: Admin123!');
  
  client.release();
  await pool.end();
  
  console.log('\n' + '='.repeat(80));
  console.log('📧 USE THESE CREDENTIALS TO LOGIN:');
  console.log('='.repeat(80));
  console.log('Email: admin@chainsync.com');
  console.log('Password: Admin123!');
  console.log('URL: http://localhost:5173/login');
  console.log('='.repeat(80));
}

checkAllAdmins();
