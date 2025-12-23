
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";

async function main() {
    const targetStoreId = "f508eda6-9d82-4690-9b48-b6313ad334d4";
    console.log(`Checking users with storeId: ${targetStoreId}`);

    const affectedUsers = await db.select({
        id: users.id,
        email: users.email,
        storeId: users.storeId
    }).from(users).where(eq(users.storeId, targetStoreId));

    console.log(`Found ${affectedUsers.length} users assigned to this store.`);
    if (affectedUsers.length > 0) {
        console.table(affectedUsers);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
