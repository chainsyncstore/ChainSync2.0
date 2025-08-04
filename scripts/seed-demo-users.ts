import { db } from "../server/db";
import { users, stores, userStorePermissions } from "../shared/schema";

async function seedDemoUsers() {
  console.log("Seeding demo users...");

  // Check if users already exist
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) {
    console.log("Demo users already exist, skipping seed.");
    return;
  }

  // Get existing stores
  const existingStores = await db.select().from(stores);
  const storeIds = existingStores.map(store => store.id);

  if (storeIds.length === 0) {
    console.log("No stores found. Please create stores first.");
    return;
  }

  // Create demo users
  const demoUsers = [
    {
      id: crypto.randomUUID(),
      username: "admin",
      role: "admin" as const,
      firstName: "Admin",
      lastName: "User",
      email: "admin@chainsync.com",
      storeId: null, // Admin doesn't belong to specific store
    },
    {
      id: crypto.randomUUID(),
      username: "manager",
      role: "manager" as const,
      firstName: "Manager",
      lastName: "User",
      email: "manager@chainsync.com",
      storeId: null, // Manager gets permissions through userStorePermissions
    },
    {
      id: crypto.randomUUID(),
      username: "cashier",
      role: "cashier" as const,
      firstName: "Cashier",
      lastName: "User",
      email: "cashier@chainsync.com",
      storeId: storeIds[0], // Assign to first store
    },
  ];

  // Insert users
  for (const user of demoUsers) {
    await db.insert(users).values(user);
    console.log(`Created user: ${user.username} (${user.role})`);
  }

  // Grant manager permissions to the first store
  const managerUser = demoUsers.find(u => u.role === "manager");
  const adminUser = demoUsers.find(u => u.role === "admin");
  
  if (managerUser && adminUser && storeIds.length > 0) {
    await db.insert(userStorePermissions).values({
      userId: managerUser.id,
      storeId: storeIds[0],
      grantedBy: adminUser.id,
    });
    console.log(`Granted manager access to store: ${storeIds[0]}`);
  }

  console.log("Demo users seeded successfully!");
  console.log("\nLogin credentials:");
  console.log("Admin: admin / admin123");
  console.log("Manager: manager / manager123");  
  console.log("Cashier: cashier / cashier123");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoUsers().catch(console.error);
}

export { seedDemoUsers };