import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function createAdmin() {
  const email = 'admin@chainsync.com';
  const password = 'Admin123!';
  
  try {
    const client = await pool.connect();
    
    // Check if admin already exists
    const existingResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`✅ Admin user already exists: ${email}`);
      console.log('Updating password...');
      
      // Update the password for existing user
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query(
        'UPDATE users SET password_hash = $1, is_admin = true, email_verified = true WHERE email = $2',
        [passwordHash, email]
      );
      
      console.log('✅ Password updated successfully!');
    } else {
      // Create new admin user
      const passwordHash = await bcrypt.hash(password, 10);
      
      const insertResult = await client.query(
        `INSERT INTO users (email, password_hash, is_admin, email_verified, requires_2fa, created_at)
         VALUES ($1, $2, true, true, false, NOW())
         RETURNING id, email`,
        [email, passwordHash]
      );
      
      console.log('🎉 Admin user created successfully!');
      console.log(`  ID: ${insertResult.rows[0].id}`);
    }
    
    console.log('\n📧 Login credentials:');
    console.log('----------------------------------------------');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('----------------------------------------------');
    
    // Also check for any other admin users
    const allAdminsResult = await client.query(
      'SELECT id, email, is_admin, email_verified FROM users WHERE is_admin = true'
    );
    
    console.log('\n👥 All admin users:');
    allAdminsResult.rows.forEach(row => {
      console.log(`  - ${row.email} (verified: ${row.email_verified})`);
    });
    
    client.release();
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

createAdmin();
