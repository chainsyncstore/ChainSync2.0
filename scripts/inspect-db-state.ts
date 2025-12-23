
import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
    console.log("=== DATABASE STATE INSPECTION ===\n");

    // 1. Organizations
    console.log("--- ORGANIZATIONS ---");
    const orgs = await db.execute(sql`SELECT id, name, is_active, created_at FROM organizations`);
    console.table(orgs.rows);

    // 2. Subscriptions
    console.log("\n--- SUBSCRIPTIONS ---");
    const subs = await db.execute(sql`SELECT id, org_id, tier, plan_code, status, provider, created_at FROM subscriptions`);
    console.table(subs.rows);

    // 3. Stores
    console.log("\n--- STORES ---");
    const stores = await db.execute(sql`SELECT id, org_id, name, is_active, tax_included, tax_rate FROM stores`);
    console.table(stores.rows);

    // 4. Users (Count & Data)
    console.log("\n--- USERS ---");
    const userCount = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    console.log(`Total Users: ${userCount.rows[0].count}`);

    const users = await db.execute(sql`SELECT id, username, email, role, org_id, store_id, is_active FROM users`);
    if (users.rows.length > 0) {
        console.table(users.rows);
    } else {
        console.log("(No users found)");
    }

    process.exit(0);
}

main().catch(err => {
    console.error("Error executing inspection:", err);
    process.exit(1);
});
