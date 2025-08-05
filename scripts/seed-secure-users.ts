import { db } from "../server/db";
import { AuthService } from "../server/auth";
import { users, stores, userStorePermissions } from "../shared/schema";

async function seedSecureUsers() {
  console.log("🔐 Seeding secure users with hashed passwords...");

  try {
    // Check if users already exist
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) {
      console.log("Users already exist, skipping seed.");
      return;
    }

    // Get existing stores
    const existingStores = await db.select().from(stores);
    const storeIds = existingStores.map(store => store.id);

    if (storeIds.length === 0) {
      console.log("No stores found. Please create stores first.");
      return;
    }

    // Generate secure passwords
    const adminPassword = AuthService.generateSecurePassword(16);
    const managerPassword = AuthService.generateSecurePassword(16);
    const cashierPassword = AuthService.generateSecurePassword(16);

    // Create secure users with hashed passwords
    const secureUsers = [
      {
        id: crypto.randomUUID(),
        username: "admin",
        role: "admin" as const,
        firstName: "System",
        lastName: "Administrator",
        email: "admin@chainsync.com",
        password: adminPassword, // Will be hashed in storage.createUser
        storeId: null, // Admin doesn't belong to specific store
        isActive: true,
      },
      {
        id: crypto.randomUUID(),
        username: "manager",
        role: "manager" as const,
        firstName: "Store",
        lastName: "Manager",
        email: "manager@chainsync.com",
        password: managerPassword, // Will be hashed in storage.createUser
        storeId: null, // Manager gets permissions through userStorePermissions
        isActive: true,
      },
      {
        id: crypto.randomUUID(),
        username: "cashier",
        role: "cashier" as const,
        firstName: "POS",
        lastName: "Cashier",
        email: "cashier@chainsync.com",
        password: cashierPassword, // Will be hashed in storage.createUser
        storeId: storeIds[0], // Assign to first store
        isActive: true,
      },
    ];

    // Insert users with hashed passwords
    for (const user of secureUsers) {
      await db.insert(users).values(user);
      console.log(`✅ Created secure user: ${user.username} (${user.role})`);
    }

    // Grant manager permissions to the first store
    const managerUser = secureUsers.find(u => u.role === "manager");
    const adminUser = secureUsers.find(u => u.role === "admin");
    
    if (managerUser && adminUser && storeIds.length > 0) {
      await db.insert(userStorePermissions).values({
        userId: managerUser.id,
        storeId: storeIds[0],
        grantedBy: adminUser.id,
      });
      console.log(`✅ Granted manager access to store: ${storeIds[0]}`);
    }

    console.log("\n🔐 Secure login credentials (SAVE THESE SECURELY):");
    console.log("================================================");
    console.log(`Admin: admin / ${adminPassword}`);
    console.log(`Manager: manager / ${managerPassword}`);
    console.log(`Cashier: cashier / ${cashierPassword}`);
    console.log("================================================");
    console.log("\n⚠️  IMPORTANT: Change these passwords immediately after first login!");
    console.log("✅ Secure users seeded successfully!");

  } catch (error) {
    console.error("❌ Error seeding secure users:", error);
    throw error;
  }
}

// Run the seed function
seedSecureUsers()
  .then(() => {
    console.log("🎉 Secure user seeding completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Secure user seeding failed:", error);
    process.exit(1);
  }); 