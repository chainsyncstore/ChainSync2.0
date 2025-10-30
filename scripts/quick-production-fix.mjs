#!/usr/bin/env node

// QUICK PRODUCTION FIX SCRIPT
// Run this with your production DATABASE_URL to fix login issues

import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

// Use the production database URL directly
const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(`
❌ Please provide DATABASE_URL as argument or environment variable

Usage:
  node scripts/quick-production-fix.mjs "postgresql://..."
  
Or set DATABASE_URL environment variable and run:
  node scripts/quick-production-fix.mjs
`);
  process.exit(1);
}

const pool = new Pool({ 
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixProduction() {
  const email = 'admin@chainsync.com';
  const password = 'Admin123!';
  
  console.log('🔧 Connecting to production database...');
  
  try {
    const client = await pool.connect();
    console.log('✅ Connected successfully');
    
    // First, check the database schema
    console.log('\n📊 Checking database schema...');
    const schemaResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('password_hash', 'password', 'passwordHash')
    `);
    
    console.log('Password columns found:', schemaResult.rows.map(r => r.column_name));
    
    // Check existing admin users
    const existingAdmins = await client.query(
      `SELECT id, email, is_admin, email_verified 
       FROM users 
       WHERE email = $1 OR is_admin = true 
       LIMIT 5`,
      [email]
    );
    
    console.log('\n👤 Existing admin users:');
    existingAdmins.rows.forEach(row => {
      console.log(`  - ${row.email} (is_admin: ${row.is_admin}, verified: ${row.email_verified})`);
    });
    
    // Generate password hash
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('\n🔐 Generated password hash');
    
    // Try to update or insert admin user
    console.log('\n📝 Creating/updating admin user...');
    
    try {
      // First try to update if exists
      const updateResult = await client.query(
        `UPDATE users 
         SET password_hash = $1, 
             is_admin = true, 
             email_verified = true,
             requires_2fa = false
         WHERE email = $2
         RETURNING id, email`,
        [passwordHash, email]
      );
      
      if (updateResult.rowCount > 0) {
        console.log('✅ Admin user updated successfully!');
        console.log('User ID:', updateResult.rows[0].id);
      } else {
        // User doesn't exist, create new one
        const insertResult = await client.query(
          `INSERT INTO users (
            email, 
            password_hash, 
            is_admin, 
            email_verified, 
            requires_2fa, 
            created_at
          ) VALUES (
            $1, $2, true, true, false, NOW()
          ) RETURNING id, email`,
          [email, passwordHash]
        );
        
        console.log('✅ Admin user created successfully!');
        console.log('User ID:', insertResult.rows[0].id);
      }
    } catch (err) {
      if (err.code === '23505') { // Unique violation
        console.log('⚠️  User exists but update failed, trying alternative approach...');
        
        // Try updating with different approach
        await client.query(
          `UPDATE users 
           SET password_hash = $1, is_admin = true, email_verified = true 
           WHERE email = $2`,
          [passwordHash, email]
        );
        
        console.log('✅ Admin user updated with alternative method!');
      } else {
        throw err;
      }
    }
    
    // Verify the user can be retrieved
    console.log('\n🔍 Verifying user retrieval...');
    const verifyResult = await client.query(
      'SELECT id, email, password_hash, is_admin, email_verified FROM users WHERE email = $1',
      [email]
    );
    
    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      console.log('✅ User verified in database:');
      console.log(`  - Email: ${user.email}`);
      console.log(`  - Has password: ${!!user.password_hash}`);
      console.log(`  - Is admin: ${user.is_admin}`);
      console.log(`  - Email verified: ${user.email_verified}`);
      
      // Test password comparison
      const isValid = await bcrypt.compare(password, user.password_hash);
      console.log(`  - Password validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 PRODUCTION FIX COMPLETE!');
    console.log('='.repeat(50));
    console.log('\n📧 Login credentials for https://chainsync.store:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    console.log('='.repeat(50));
    
    client.release();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.detail) console.error('Details:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
  } finally {
    await pool.end();
  }
}

fixProduction().catch(console.error);
