import { db } from "../server/db";
import { loyaltyTiers, customers } from "../shared/schema";

async function seedLoyaltyData() {
  console.log("🌱 Seeding loyalty program data...");

  try {
    // Create loyalty tiers for store 1
    const tiers = await db.insert(loyaltyTiers).values([
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        name: "Bronze",
        description: "New customers start here",
        pointsRequired: 0,
        discountPercentage: 0,
        color: "#CD7F32",
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        name: "Silver",
        description: "Earn 5% discount on purchases",
        pointsRequired: 1000,
        discountPercentage: 5,
        color: "#C0C0C0",
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        name: "Gold",
        description: "Earn 10% discount on purchases",
        pointsRequired: 3000,
        discountPercentage: 10,
        color: "#FFD700",
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        name: "Platinum",
        description: "Earn 15% discount on purchases",
        pointsRequired: 10000,
        discountPercentage: 15,
        color: "#E5E4E2",
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${tiers.length} loyalty tiers`);

    // Create sample customers
    const sampleCustomers = await db.insert(customers).values([
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@email.com",
        phone: "+1-555-0123",
        loyaltyNumber: "LOY001",
        currentPoints: 1250,
        lifetimePoints: 2500,
        tierId: tiers[1].id, // Silver tier
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@email.com",
        phone: "+1-555-0456",
        loyaltyNumber: "LOY002",
        currentPoints: 3200,
        lifetimePoints: 5000,
        tierId: tiers[2].id, // Gold tier
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        firstName: "Bob",
        lastName: "Johnson",
        email: "bob.johnson@email.com",
        phone: "+1-555-0789",
        loyaltyNumber: "LOY003",
        currentPoints: 450,
        lifetimePoints: 800,
        tierId: tiers[0].id, // Bronze tier
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        firstName: "Alice",
        lastName: "Brown",
        email: "alice.brown@email.com",
        phone: "+1-555-0321",
        loyaltyNumber: "LOY004",
        currentPoints: 8500,
        lifetimePoints: 12000,
        tierId: tiers[2].id, // Gold tier
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440000", // Store 1
        firstName: "Charlie",
        lastName: "Wilson",
        email: "charlie.wilson@email.com",
        phone: "+1-555-0654",
        loyaltyNumber: "LOY005",
        currentPoints: 15000,
        lifetimePoints: 20000,
        tierId: tiers[3].id, // Platinum tier
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${sampleCustomers.length} sample customers`);

    // Create loyalty tiers for store 2
    const store2Tiers = await db.insert(loyaltyTiers).values([
      {
        storeId: "550e8400-e29b-41d4-a716-446655440001", // Store 2
        name: "Bronze",
        description: "New customers start here",
        pointsRequired: 0,
        discountPercentage: 0,
        color: "#CD7F32",
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440001", // Store 2
        name: "Silver",
        description: "Earn 5% discount on purchases",
        pointsRequired: 1000,
        discountPercentage: 5,
        color: "#C0C0C0",
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440001", // Store 2
        name: "Gold",
        description: "Earn 10% discount on purchases",
        pointsRequired: 3000,
        discountPercentage: 10,
        color: "#FFD700",
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${store2Tiers.length} loyalty tiers for store 2`);

    // Create sample customers for store 2
    const store2Customers = await db.insert(customers).values([
      {
        storeId: "550e8400-e29b-41d4-a716-446655440001", // Store 2
        firstName: "David",
        lastName: "Miller",
        email: "david.miller@email.com",
        phone: "+1-555-0987",
        loyaltyNumber: "LOY101",
        currentPoints: 800,
        lifetimePoints: 1200,
        tierId: store2Tiers[0].id, // Bronze tier
        isActive: true,
      },
      {
        storeId: "550e8400-e29b-41d4-a716-446655440001", // Store 2
        firstName: "Emma",
        lastName: "Davis",
        email: "emma.davis@email.com",
        phone: "+1-555-0543",
        loyaltyNumber: "LOY102",
        currentPoints: 2500,
        lifetimePoints: 4000,
        tierId: store2Tiers[2].id, // Gold tier
        isActive: true,
      },
    ]).returning();

    console.log(`✅ Created ${store2Customers.length} sample customers for store 2`);

    console.log("🎉 Loyalty program data seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding loyalty data:", error);
    throw error;
  }
}

// Run the seed function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedLoyaltyData()
    .then(() => {
      console.log("✅ Loyalty seeding completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Loyalty seeding failed:", error);
      process.exit(1);
    });
}

export default seedLoyaltyData; 