# Set environment variables
$env:DATABASE_URL = "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"

Write-Host "Checking database schema..."

# Create a simple Node.js script to check the schema
$scriptContent = @'
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    const client = await pool.connect();
    
    // Check if users table exists
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Tables in database:');
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    // Check columns in users table
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 Columns in users table:');
    columnsResult.rows.forEach(row => 
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`)
    );
    
    // Check for existing admin users
    const usersResult = await client.query(`
      SELECT id, email, role, is_admin 
      FROM users 
      WHERE email LIKE '%admin%' OR is_admin = true
    `);
    
    console.log('\n👤 Admin users found:');
    if (usersResult.rows.length > 0) {
      usersResult.rows.forEach(row => 
        console.log(`  - ${row.email} (role: ${row.role}, is_admin: ${row.is_admin})`)
      );
    } else {
      console.log('  No admin users found');
    }
    
    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkSchema();
'@

# Write the script to a temporary file
$scriptContent | Out-File -FilePath "temp-check-schema.mjs" -Encoding UTF8

# Run the script
node temp-check-schema.mjs

# Clean up
Remove-Item "temp-check-schema.mjs"
