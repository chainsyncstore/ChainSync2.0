import { eq, and, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { transactions, stores } from '../shared/schema';

async function main() {
    console.log('Starting refund tax fix...');

    try {
        // 1. Get all refunds with 0 tax
        // We cast to numeric to ensure correct comparison
        const refundsToFix = await db.select()
            .from(transactions)
            .where(and(
                eq(transactions.kind, 'REFUND'),
                // Check for 0 tax. Using string comparison for decimal
                sql`${transactions.taxAmount} = 0`
            ));

        console.log(`Found ${refundsToFix.length} refunds with 0 tax.`);

        if (refundsToFix.length === 0) {
            console.log('No refunds to fix.');
            return;
        }

        for (const refund of refundsToFix) {
            let taxRate = 0.075; // Default fallback (e.g. 7.5%) if no other info found. 
            // Ideally fetch from store if available, but we need storeId.

            const storeId = refund.storeId;
            let storeTaxRate = 0.075;

            // 2. Try to get store tax rate first as baseline
            if (storeId) {
                const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
                if (store.length > 0 && store[0].taxRate) {
                    storeTaxRate = Number(store[0].taxRate);
                    taxRate = storeTaxRate;
                }
            }

            // 3. Try to find parent transaction to get exact rate used at time of sale
            if (refund.originTransactionId) {
                const parents = await db.select().from(transactions).where(eq(transactions.id, refund.originTransactionId)).limit(1);
                if (parents.length > 0) {
                    const parent = parents[0];
                    const parentSubtotal = Number(parent.subtotal);
                    const parentTax = Number(parent.taxAmount);

                    if (parentSubtotal > 0) {
                        taxRate = parentTax / parentSubtotal;
                        // Sanity check rate
                        if (Math.abs(taxRate - storeTaxRate) > 0.05) {
                            console.warn(`Warning: refund derived rate ${taxRate} differs significantly from store rate ${storeTaxRate} for txn ${refund.id}`);
                        }
                    }
                }
            }

            // 4. Calculate tax
            // Refund Total is Tax Inclusive (Gross)
            // Net + (Net * Rate) = Total
            // Net * (1 + Rate) = Total
            // Net = Total / (1 + Rate)
            // Tax = Total - Net

            const total = Number(refund.total);
            if (total === 0) continue;

            const net = total / (1 + taxRate);
            const tax = total - net; // This is the tax portion inclusive in the total

            const taxStr = tax.toFixed(2);

            // 5. Update
            await db.update(transactions)
                .set({ taxAmount: sql`${taxStr}` })
                .where(eq(transactions.id, refund.id));

            console.log(`Fixed refund ${refund.id}: Total ${total} -> Tax ${taxStr} (Rate: ${(taxRate * 100).toFixed(2)}%)`);
        }

        console.log('All refunds processed.');
    } catch (error) {
        console.error('Error running fix script:', error);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
