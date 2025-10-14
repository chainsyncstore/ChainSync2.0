import { db } from '../server/db';
import { organizations, subscriptions, stores, users, userRoles } from '../shared/prd-schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedSubscriptionTestData() {
  console.log('🌱 Seeding subscription test data...');

  try {
    // Clean up previous test data
    await db.delete(userRoles).where(eq(userRoles.role, 'MANAGER'));
    await db.delete(users).where(eq(users.email, 'basic-admin@test.com'));
    await db.delete(users).where(eq(users.email, 'pro-admin@test.com'));
    await db.delete(users).where(eq(users.email, 'enterprise-admin@test.com'));
    await db.delete(stores).where(eq(stores.name, 'Basic Store'));
    await db.delete(stores).where(eq(stores.name, 'Pro Store 1'));
    await db.delete(stores).where(eq(stores.name, 'Pro Store 2'));
    await db.delete(subscriptions).where(eq(subscriptions.planCode, 'basic'));
    await db.delete(subscriptions).where(eq(subscriptions.planCode, 'pro'));
    await db.delete(subscriptions).where(eq(subscriptions.planCode, 'enterprise'));
    await db.delete(organizations).where(eq(organizations.name, 'Basic Org'));
    await db.delete(organizations).where(eq(organizations.name, 'Pro Org'));
    await db.delete(organizations).where(eq(organizations.name, 'Enterprise Org'));


    console.log('🧹 Cleaned up previous test data.');

    // --- Basic Plan ---
    const [basicOrg] = await db.insert(organizations).values({ name: 'Basic Org' }).returning();
    await db.insert(subscriptions).values({ orgId: basicOrg.id, provider: 'PAYSTACK', planCode: 'basic', status: 'ACTIVE' });
    const basicAdminPass = await bcrypt.hash('password', 10);
    const [basicAdmin] = await db.insert(users).values({ orgId: basicOrg.id, email: 'basic-admin@test.com', passwordHash: basicAdminPass, isAdmin: true }).returning();
    await db.insert(stores).values({ orgId: basicOrg.id, name: 'Basic Store' });
    console.log('✅ Created Basic Plan test data.');

    // --- Pro Plan ---
    const [proOrg] = await db.insert(organizations).values({ name: 'Pro Org' }).returning();
    await db.insert(subscriptions).values({ orgId: proOrg.id, provider: 'PAYSTACK', planCode: 'pro', status: 'ACTIVE' });
    const proAdminPass = await bcrypt.hash('password', 10);
    const [proAdmin] = await db.insert(users).values({ orgId: proOrg.id, email: 'pro-admin@test.com', passwordHash: proAdminPass, isAdmin: true }).returning();
    const [proManager] = await db.insert(users).values({ orgId: proOrg.id, email: 'pro-manager@test.com', passwordHash: proAdminPass, isAdmin: false }).returning();
    const [proStore1] = await db.insert(stores).values({ orgId: proOrg.id, name: 'Pro Store 1' }).returning();
    const [proStore2] = await db.insert(stores).values({ orgId: proOrg.id, name: 'Pro Store 2' }).returning();
    await db.insert(userRoles).values({ userId: proManager.id, orgId: proOrg.id, storeId: proStore1.id, role: 'MANAGER' });
    console.log('✅ Created Pro Plan test data.');

    // --- Enterprise Plan ---
    const [enterpriseOrg] = await db.insert(organizations).values({ name: 'Enterprise Org' }).returning();
    await db.insert(subscriptions).values({ orgId: enterpriseOrg.id, provider: 'PAYSTACK', planCode: 'enterprise', status: 'ACTIVE' });
    const enterpriseAdminPass = await bcrypt.hash('password', 10);
    await db.insert(users).values({ orgId: enterpriseOrg.id, email: 'enterprise-admin@test.com', passwordHash: enterpriseAdminPass, isAdmin: true });
    console.log('✅ Created Enterprise Plan test data.');

    console.log('🎉 Subscription test data seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding subscription test data:', error);
    throw error;
  }
}

seedSubscriptionTestData();
