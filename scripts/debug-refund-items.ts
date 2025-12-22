
import { eq, desc } from 'drizzle-orm';
import { db } from '../server/db';
import { transactions, transactionItems, stockMovements, inventoryRevaluationEvents } from '../shared/schema';

async function main() {
    try {
        console.log('Querying recent refunds with items...');

        // 1. Get recent refunds
        const refunds = await db.select()
            .from(transactions)
            .where(eq(transactions.kind, 'REFUND'))
            .orderBy(desc(transactions.createdAt))
            .limit(3);

        console.log(`Found ${refunds.length} refunds.`);

        for (const r of refunds) {
            console.log(`\nRefund ID: ${r.id}, Total: ${r.total}, Notes/Source: ${r.source}`);

            // 2. Get items
            const items = await db.select()
                .from(transactionItems)
                .where(eq(transactionItems.transactionId, r.id));

            console.log(`  Items (${items.length}):`);
            items.forEach(i => {
                console.log(`    - Product: ${i.productId}, Qty: ${i.quantity}, Total Price: ${i.totalPrice}, Total Cost: ${i.totalCost}`);
            });

            // 3. Check Stock Movements
            // Stock movements usually link to transaction via referenceId? Or just time/store/product?
            // Let's try to find movements referencing this transaction ID
            const movements = await db.select()
                .from(stockMovements)
                .where(eq(stockMovements.referenceId, r.id));

            console.log(`  Stock Movements (${movements.length}):`);
            movements.forEach(m => {
                console.log(`    - Type: ${m.actionType}, Delta: ${m.delta}, Source: ${m.source}, Notes: ${m.notes}`);
            });

            // 4. Check Inventory Revaluation (Losses)
            const revals = await db.select()
                .from(inventoryRevaluationEvents)
                .where(eq(inventoryRevaluationEvents.referenceId, r.id));

            console.log(`  Revaluation Events (${revals.length}):`);
            revals.forEach(ev => {
                console.log(`    - Source: ${ev.source}, Delta Value: ${ev.deltaValue}`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
