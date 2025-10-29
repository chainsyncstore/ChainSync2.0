import 'dotenv/config';

// Set environment variables
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require";
process.env.NODE_ENV = 'development';

import { DatabaseStorage } from './server/storage.js';
import bcrypt from 'bcrypt';

async function testStorage() {
  const storage = new DatabaseStorage();
  const email = 'admin@chainsync.com';
  const password = 'Admin123!';
  
  console.log('🔍 Testing storage.getUserByEmail...');
  
  try {
    const user = await storage.getUserByEmail(email);
    
    if (user) {
      console.log('✅ User found!');
      console.log('User fields present:');
      console.log('  - id:', !!user.id);
      console.log('  - email:', user.email);
      console.log('  - passwordHash:', !!user.passwordHash);
      console.log('  - password_hash:', !!user.password_hash);
      console.log('  - password:', !!user.password);
      console.log('  - emailVerified:', user.emailVerified);
      console.log('  - is_admin:', user.is_admin);
      console.log('  - isAdmin:', user.isAdmin);
      
      // Test password comparison
      const storedHash = user.password_hash || user.passwordHash || user.password;
      if (storedHash) {
        console.log('\n🔐 Testing password comparison...');
        console.log('Stored hash starts with:', storedHash.substring(0, 10));
        const isValid = await bcrypt.compare(password, storedHash);
        console.log('Password match:', isValid);
      } else {
        console.log('❌ No password hash found in user object');
      }
    } else {
      console.log('❌ User not found');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testStorage();
