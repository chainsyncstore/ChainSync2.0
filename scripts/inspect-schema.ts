import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function main() {
    try {
        const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'transactions';
    `);
        console.log('Columns in transactions table:');
        result.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));
    } catch (error) {
        console.error('Error querying columns:', error);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
