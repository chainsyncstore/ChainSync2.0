import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function main() {
    try {
        const result = await db.execute(sql`SELECT * FROM transactions LIMIT 1`);
        if (result.rows.length > 0) {
            console.log('Row keys:', Object.keys(result.rows[0]));
        } else {
            console.log('No rows in transactions table');
        }
    } catch (error) {
        console.error('Error executing raw query:', error);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
