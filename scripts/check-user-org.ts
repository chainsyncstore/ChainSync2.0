

import { db } from "../server/db";
import { users, stores, organizations } from "../shared/schema";

async function main() {
    console.log("Checking User-Org-Store Relationships...");

    // 1. Get all organizations
    const allOrgs = await db.select({
        id: organizations.id,
        name: organizations.name
    }).from(organizations);
    console.log(`\n--- Organizations (${allOrgs.length}) ---`);
    console.table(allOrgs);

    // 2. Get all stores
    const allStores = await db.select({
        id: stores.id,
        name: stores.name,
        orgId: stores.orgId,
        isActive: stores.isActive
    }).from(stores);
    console.log(`\n--- Stores (${allStores.length}) ---`);
    console.table(allStores.map(s => ({ id: s.id, name: s.name, orgId: s.orgId, active: s.isActive })));

    // 3. Get all users
    const allUsers = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
        storeId: users.storeId
    }).from(users);
    console.log(`\n--- Users (${allUsers.length}) ---`);
    console.table(allUsers.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        orgId: u.orgId,
        storeId: u.storeId
    })));

    // 4. Analysis
    console.log("\n--- Mismatch Analysis ---");
    for (const user of allUsers) {
        if (!user.orgId) {
            console.warn(`User ${user.username} has NO Organization ID!`);
            continue;
        }

        const userStores = allStores.filter(s => s.orgId === user.orgId);
        if (userStores.length === 0) {
            console.warn(`User ${user.username} is in Org ${user.orgId} but that Org has NO STORES!`);
        } else {
            console.log(`User ${user.username} belongs to Org ${user.orgId} which has ${userStores.length} stores.`);
            if (user.storeId && !userStores.find(s => s.id === user.storeId)) {
                console.error(`CRITICAL: User ${user.username} is assigned to Store ${user.storeId} which does NOT belong to their Org!`);
                console.error(`  - User Org: ${user.orgId}`);
                console.error(`  - Store belongs to Org: ${allStores.find(s => s.id === user.storeId)?.orgId ?? "UNKNOWN STORE"}`);
            }
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
