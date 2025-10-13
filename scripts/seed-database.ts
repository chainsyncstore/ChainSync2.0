import { db } from "../server/db";
import { stores, products, inventory, users, loyaltyTiers, customers } from "../shared/schema";

async function seedLoyaltyData(store1Id: string, store2Id: string) {
  console.log("🌱 Seeding loyalty program data...");

  try {
    // Create loyalty tiers for store 1
    const tiers1 = await db.insert(loyaltyTiers).values([
      {
        storeId: store1Id,
        name: "Bronze",
        description: "New customers start here",
        pointsRequired: 0,
        discountPercentage: 0,
        color: "#CD7F32",
        isActive: true,
      },
      {
        storeId: store1Id,
        name: "Silver",
        description: "Earn 5% discount on purchases",
        pointsRequired: 1000,
        discountPercentage: 5,
        color: "#C0C0C0",
        isActive: true,
      },
      {
        storeId: store1Id,
        name: "Gold",
        description: "Earn 10% discount on purchases",
        pointsRequired: 3000,
        discountPercentage: 10,
        color: "#FFD700",
        isActive: true,
      },
      {
        storeId: store1Id,
        name: "Platinum",
        description: "Earn 15% discount on purchases",
        pointsRequired: 10000,
        discountPercentage: 15,
        color: "#E5E4E2",
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${tiers1.length} loyalty tiers for store 1`);

    // Create sample customers for store 1
    await db.insert(customers).values([
      {
        storeId: store1Id,
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@email.com",
        phone: "+1-555-0123",
        loyaltyNumber: "LOY001",
        currentPoints: 1250,
        lifetimePoints: 2500,
        tierId: tiers1[1].id, // Silver tier
        isActive: true,
      },
      {
        storeId: store1Id,
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@email.com",
        phone: "+1-555-0456",
        loyaltyNumber: "LOY002",
        currentPoints: 3200,
        lifetimePoints: 5000,
        tierId: tiers1[2].id, // Gold tier
        isActive: true,
      },
    ]);

    // Create loyalty tiers for store 2
    const tiers2 = await db.insert(loyaltyTiers).values([
      {
        storeId: store2Id,
        name: "Bronze",
        description: "New customers start here",
        pointsRequired: 0,
        discountPercentage: 0,
        color: "#CD7F32",
        isActive: true,
      },
      {
        storeId: store2Id,
        name: "Silver",
        description: "Earn 5% discount on purchases",
        pointsRequired: 1000,
        discountPercentage: 5,
        color: "#C0C0C0",
        isActive: true,
      },
      {
        storeId: store2Id,
        name: "Gold",
        description: "Earn 10% discount on purchases",
        pointsRequired: 3000,
        discountPercentage: 10,
        color: "#FFD700",
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${tiers2.length} loyalty tiers for store 2`);

    // Create sample customers for store 2
    await db.insert(customers).values([
      {
        storeId: store2Id,
        firstName: "David",
        lastName: "Miller",
        email: "david.miller@email.com",
        phone: "+1-555-0987",
        loyaltyNumber: "LOY101",
        currentPoints: 800,
        lifetimePoints: 1200,
        tierId: tiers2[0].id, // Bronze tier
        isActive: true,
      },
    ]);

    console.log("🎉 Loyalty program data seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding loyalty data:", error);
    throw error;
  }
}

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create sample stores
    const [store1] = await db.insert(stores).values({
      name: "Downtown Store",
      address: "123 Main Street, Downtown",
      phone: "+1-555-0123",
    }).returning();

    const [store2] = await db.insert(stores).values({
      name: "Mall Location",
      address: "456 Shopping Mall, North Side",
      phone: "+1-555-0456",
    }).returning();

    console.log(`✅ Created stores: ${store1.name}, ${store2.name}`);

    // Create sample users for all roles
    const [admin] = await db.insert(users).values({
      username: "admin",
      firstName: "System",
      lastName: "Administrator",
      email: "admin@chainsync.com",
      role: "admin",
      storeId: null, // Admin can access all stores
    }).returning();

    const [manager] = await db.insert(users).values({
      username: "manager",
      firstName: "John",
      lastName: "Doe",
      email: "manager@chainsync.com",
      role: "manager",
      storeId: store1.id,
    }).returning();

    const [cashier] = await db.insert(users).values({
      username: "cashier",
      firstName: "Alice",
      lastName: "Johnson",
      email: "cashier@chainsync.com",
      role: "cashier",
      storeId: store1.id,
    }).returning();

    console.log(`✅ Created users: ${admin.firstName} ${admin.lastName} (Admin), ${manager.firstName} ${manager.lastName} (Manager), ${cashier.firstName} ${cashier.lastName} (Cashier)`);

    // Create sample products
    const sampleProducts = [
      {
        name: "Organic Bananas",
        barcode: "1234567890123",
        price: "2.99",
        category: "Fruits",
        brand: "Fresh Farms",
        description: "Fresh organic bananas",
        cost: "1.50",
      },
      {
        name: "Whole Wheat Bread",
        barcode: "2345678901234",
        price: "4.50",
        category: "Bakery",
        brand: "Healthy Harvest",
        description: "100% whole wheat bread",
        cost: "2.25",
      },
      {
        name: "Greek Yogurt",
        barcode: "3456789012345",
        price: "5.99",
        category: "Dairy",
        brand: "Pure Greek",
        description: "Organic Greek yogurt",
        cost: "3.00",
      },
    ];

    const insertedProducts = await db.insert(products).values(sampleProducts).returning();
    console.log(`✅ Created ${insertedProducts.length} products`);

    // Create inventory for both stores
    const inventoryData = [];
    for (const product of insertedProducts) {
      inventoryData.push({
        storeId: store1.id,
        productId: product.id,
        quantity: Math.floor(Math.random() * 100) + 20,
        minStockLevel: 10,
        maxStockLevel: 100,
      });
      inventoryData.push({
        storeId: store2.id,
        productId: product.id,
        quantity: Math.floor(Math.random() * 100) + 20,
        minStockLevel: 10,
        maxStockLevel: 100,
      });
    }

    await db.insert(inventory).values(inventoryData);
    console.log(`✅ Created inventory for ${inventoryData.length} items across both stores`);

    // Seed loyalty program data
    await seedLoyaltyData(store1.id, store2.id);

    console.log("🎉 Database seeded successfully!");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run the seed function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch(console.error);
}

export default seed;
