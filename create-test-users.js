import { db } from './server/db.js';
import { users, stores } from './shared/schema.js';

async function createTestUsers() {
  try {
    console.log('🏪 Creating test stores...');
    
    // Create stores first
    const [store1] = await db.insert(stores).values({
      name: "Downtown Store",
      address: "123 Main Street, Downtown",
      phone: "+1-555-0123",
      taxRate: "0.085",
    }).returning();

    const [store2] = await db.insert(stores).values({
      name: "Mall Location", 
      address: "456 Shopping Mall, North Side",
      phone: "+1-555-0456",
      taxRate: "0.085",
    }).returning();

    console.log(`✅ Created stores: ${store1.name}, ${store2.name}`);

    console.log('👥 Creating test users...');
    
    // Create admin user (no store assigned)
    const [admin] = await db.insert(users).values({
      username: "admin",
      firstName: "System",
      lastName: "Administrator", 
      email: "admin@chainsync.com",
      role: "admin",
      storeId: null,
    }).returning();

    // Create manager user
    const [manager] = await db.insert(users).values({
      username: "manager",
      firstName: "John",
      lastName: "Doe",
      email: "manager@chainsync.com", 
      role: "manager",
      storeId: store1.id,
    }).returning();

    // Create cashier user
    const [cashier] = await db.insert(users).values({
      username: "cashier",
      firstName: "Alice",
      lastName: "Johnson",
      email: "cashier@chainsync.com",
      role: "cashier", 
      storeId: store1.id,
    }).returning();

    console.log('✅ Created test users:');
    console.log(`- Admin: ${admin.username} (${admin.role})`);
    console.log(`- Manager: ${manager.username} (${manager.role})`);
    console.log(`- Cashier: ${cashier.username} (${cashier.role})`);

    // Verify users were created
    const allUsers = await db.select().from(users);
    console.log(`📊 Total users in database: ${allUsers.length}`);

  } catch (error) {
    console.error('❌ Error creating test users:', error);
  }
}

createTestUsers(); 