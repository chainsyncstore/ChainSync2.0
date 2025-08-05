import { db } from "../server/db";
import { stores, products, inventory, users } from "../shared/schema";
import seedLoyaltyData from "./seed-loyalty";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create sample stores
    const [store1] = await db.insert(stores).values({
      name: "Downtown Store",
      address: "123 Main Street, Downtown",
      phone: "+1-555-0123",
      manager: "John Doe",
    }).returning();

    const [store2] = await db.insert(stores).values({
      name: "Mall Location",
      address: "456 Shopping Mall, North Side",
      phone: "+1-555-0456",
      manager: "Jane Smith",
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
      {
        name: "Coffee Beans",
        barcode: "4567890123456",
        price: "12.99",
        category: "Beverages",
        brand: "Mountain Roast",
        description: "Premium arabica coffee beans",
        cost: "6.50",
      },
      {
        name: "Chicken Breast",
        barcode: "5678901234567",
        price: "8.99",
        category: "Meat",
        brand: "Farm Fresh",
        description: "Free-range chicken breast",
        cost: "5.50",
      },
    ];

    const insertedProducts = await db.insert(products).values(sampleProducts).returning();
    console.log(`✅ Created ${insertedProducts.length} products`);

    // Create inventory for both stores
    const inventoryData = [];
    for (const product of insertedProducts) {
      // Store 1 inventory
      inventoryData.push({
        storeId: store1.id,
        productId: product.id,
        quantity: Math.floor(Math.random() * 100) + 20, // 20-120 items
        minStockLevel: 10,
        maxStockLevel: 100,
      });

      // Store 2 inventory
      inventoryData.push({
        storeId: store2.id,
        productId: product.id,
        quantity: Math.floor(Math.random() * 100) + 20, // 20-120 items
        minStockLevel: 10,
        maxStockLevel: 100,
      });
    }

    await db.insert(inventory).values(inventoryData);
    console.log(`✅ Created inventory for ${inventoryData.length} items across both stores`);

    // Seed loyalty program data
    await seedLoyaltyData();

    console.log("🎉 Database seeded successfully!");
    console.log(`Store IDs: ${store1.id}, ${store2.id}`);
    
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