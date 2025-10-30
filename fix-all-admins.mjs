import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function fixAllAdmins() {
  const client = await pool.connect();
  const password = 'Admin123!';
  const passwordHash = await bcrypt.hash(password, 10);
  
  console.log('🔧 Fixing ALL admin accounts to use password: Admin123!\n');
  
  // Update both admin accounts
  const admins = [
    'admin@chainsync.com',
    'admin@chainsync.local'
  ];
  
  for (const email of admins) {
    await client.query(`
      INSERT INTO users (email, password_hash, is_admin, email_verified, requires_2fa, created_at)
      VALUES ($1, $2, true, true, false, NOW())
      ON CONFLICT (email) 
      DO UPDATE SET 
        password_hash = $2,
        is_admin = true,
        email_verified = true
    `, [email, passwordHash]);
    
    console.log(`✅ Fixed: ${email} with password: Admin123!`);
  }
  
  client.release();
  await pool.end();
  
  console.log('\n' + '='.repeat(60));
  console.log('BOTH ADMIN ACCOUNTS NOW WORK WITH:');
  console.log('='.repeat(60));
  console.log('Email: admin@chainsync.com     OR     admin@chainsync.local');
  console.log('Password: Admin123!');
  console.log('='.repeat(60));
}

fixAllAdmins();
