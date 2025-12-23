
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { users, stores, organizations } from "../shared/schema";

async function main() {
    console.log("Creating Recovery User (Robust Mode)...");

    // 1. Check if ANY user exists (using count for safety)
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    const count = Number(countResult.rows[0].count);

    if (count > 0) {
        console.log("Users already exist. Skipping creation.");
        process.exit(0);
    }

    // 2. Find Org (Select specific ID only)
    console.log("Fetching Organization...");
    const orgs = await db.select({ id: organizations.id }).from(organizations).limit(1);
    if (orgs.length === 0) {
        console.error("No Organizations found! Cannot create user.");
        process.exit(1);
    }
    const orgId = orgs[0].id;
    console.log(`organization found: ${orgId}`);

    // 3. Find Store (Select specific ID only)
    console.log("Fetching Store...");
    const userStores = await db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId)).limit(1);
    let storeId = null;
    if (userStores.length > 0) {
        storeId = userStores[0].id;
        console.log(`Store found: ${storeId}`);
    } else {
        console.warn("No stores found for this org. User will be created without a store.");
    }

    // 4. Create User
    console.log("Hashing password...");
    const passwordHash = await bcrypt.hash("password123", 10);

    console.log("Inserting user...");
    try {
        const [newUser] = await db.insert(users).values({
            username: "admin",
            email: "admin@example.com",
            passwordHash: passwordHash, // Correct field for password_hash column
            password: passwordHash,     // Legacy field for compatibility
            role: "admin",
            orgId: orgId,
            storeId: storeId,
            isActive: true,
            emailVerified: true,
            failedLoginAttempts: 0
        } as any).returning({
            id: users.id,
            username: users.username,
            email: users.email
        });

        console.log("✅ Recovery user created successfully!");
        console.log({
            username: newUser.username,
            email: newUser.email,
            password: "password123"
        });
    } catch (err) {
        console.error("Insert failed:", err);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
