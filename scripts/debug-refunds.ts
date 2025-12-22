
import { eq, desc } from 'drizzle-orm';
import { db } from '../server/db';
import { transactions } from '../shared/schema';

async function main() {
    try {
        console.log('Querying recent refunds...');
        const refunds = await db.select()
            .from(transactions)
            .where(eq(transactions.kind, 'REFUND'))
            .orderBy(desc(transactions.createdAt))
            .limit(5);

        console.log('Found refunds:', refunds.length);
        refunds.forEach(r => {
            console.log(`ID: ${r.id}, Date: ${r.createdAt}, Total: ${r.total}, Tax: ${r.taxAmount}, Subtotal: ${r.subtotal}`);
        });
    } catch (error) {
        console.error('Error querying refunds:', error);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
