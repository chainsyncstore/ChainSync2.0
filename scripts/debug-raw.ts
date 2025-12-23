
import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
    console.log("Checking User Count (Raw SQL)...");

    const result = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    console.log(`User Count: ${result.rows[0].count}`);

    const users = await db.execute(sql`SELECT * FROM users LIMIT 5`);
    console.log(`Sample Users:`, users.rows);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
