
import { count, eq } from "drizzle-orm";
import { db } from "../server/db";
import { inventory, stores } from "../shared/schema";

async function main() {
    console.log("Listing Inventory Counts per Store...");

    // Select only fields that definitely exist in DB
    const allStores = await db.select({
        id: stores.id,
        name: stores.name,
        isActive: stores.isActive
    }).from(stores);

    console.table(allStores.map(s => ({
        id: s.id,
        name: s.name,
        active: s.isActive
    })));

    for (const store of allStores) {
        const result = await db
            .select({ count: count() })
            .from(inventory)
            .where(eq(inventory.storeId, store.id));

        console.log(`Store: ${store.name} (${store.id}) -> Inventory Count: ${result[0].count}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
