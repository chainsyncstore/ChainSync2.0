import { db } from './server/db.js';
import { users, stores } from './shared/schema.js';

async function testSeed() {
  try {
    console.log('🌱 Testing database connection...');
    
    // Test 1: Check if we can connect
    console.log('✅ Database connection successful');
    
    // Test 2: Try to create a simple user
    console.log('👤 Creating test user...');
    const [testUser] = await db.insert(users).values({
      username: "testuser",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      role: "cashier",
    }).returning();
    
    console.log('✅ Test user created:', testUser);
    
    // Test 3: Check if user exists
    const allUsers = await db.select().from(users);
    console.log('📊 Total users in database:', allUsers.length);
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  }
}

testSeed(); 