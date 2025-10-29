import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function debugUserLookup() {
  const email = 'admin@chainsync.com';
  
  try {
    const client = await pool.connect();
    
    console.log('🔍 Looking up user with email:', email);
    
    // Get all data for this user
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('\n✅ User found!');
      console.log('User fields:');
      Object.keys(user).forEach(key => {
        const value = user[key];
        if (key.includes('password') || key.includes('hash')) {
          console.log(`  ${key}: ${value ? `[HASH ${value.substring(0, 20)}...]` : 'null'}`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      });
    } else {
      console.log('❌ No user found with email:', email);
      
      // List all users to see what's in the database
      const allUsersResult = await client.query(
        'SELECT id, email FROM users LIMIT 10'
      );
      
      console.log('\n📋 Users in database:');
      allUsersResult.rows.forEach(row => {
        console.log(`  - ${row.email} (id: ${row.id})`);
      });
    }
    
    client.release();
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

debugUserLookup();
