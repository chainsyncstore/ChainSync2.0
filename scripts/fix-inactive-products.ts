
import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
    console.log("Checking for inactive products...");

    // Count inactive products
    const inactiveCountResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM products WHERE is_active = false
  `);

    const inactiveCount = Number(inactiveCountResult.rows[0].count);
    console.log(`Found ${inactiveCount} inactive products.`);

    if (inactiveCount > 0) {
        console.log("Re-activating products...");
        await db.execute(sql`
      UPDATE products SET is_active = true WHERE is_active = false
    `);
        console.log(`Fixed! All products are now active.`);
    } else {
        console.log("No inactive products found. The issue might be elsewhere if POS is still empty.");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("Error running fix script:", err);
    process.exit(1);
});
