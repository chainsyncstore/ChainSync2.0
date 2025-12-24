import { aiInsightsService } from '../server/ai/ai-insights-service';
import { db } from '../server/db';
import { stores, products, transactions, transactionItems, inventoryRevaluationEvents, organizations, users } from '../shared/schema';

async function main() {
    console.log('Starting AI Analytics Verification...');

    // 1. Setup Data
    // Find or create a test store
    const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
    if (!org) throw new Error('No organization found');

    // Use an existing store to avoid schema mismatch issues on insert
    const [store] = await db.select({ id: stores.id, name: stores.name }).from(stores).limit(1);
    if (!store) throw new Error('No store found');

    // Get a user for cashier_id
    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    const cashierId = user?.id || store.ownerId; // Fallback to owner if no user found

    if (!cashierId) throw new Error('No valid cashier_id found (user or store owner)');

    console.log(`Using existing store: ${store.name} (${store.id})`);
    console.log(`Using cashier ID: ${cashierId} `);

    // Create a product
    const [product] = await db.insert(products).values({
        storeId: store.id,
        orgId: org.id,
        name: 'Test Widget',
        price: '100.00',
        costPrice: '50.00',
        sku: `WIDGET_${Date.now()} `,
        stock: 100,
    } as any).returning();

    // Init Inventory - skipping to avoid schema mismatch on avg_cost. 
    // Current stock will report 0, which is fine for profit verification.
    /*
    await db.insert(inventory).values({
        storeId: store.id,
        productId: product.id,
        quantity: 100,
        minStockLevel: 10
    } as any);
    */

    console.log(`Created product: ${product.name} (${product.id})`);

    // 2. Simulate Transactions

    // SALE: 10 Units @ $100 (Total $1000, Tax $0 for simplicity, Cost $500)
    const [saleTx] = await db.insert(transactions).values({
        storeId: store.id,
        cashierId: cashierId,
        status: 'completed',
        kind: 'SALE',
        total: '1000.00',
        subtotal: '1000.00',
        taxAmount: '0.00',
        paymentMethod: 'cash',
        createdAt: new Date(),
    } as any).returning();

    await db.insert(transactionItems).values({
        transactionId: saleTx.id,
        productId: product.id,
        quantity: 10,
        unitPrice: '100.00',
        totalPrice: '1000.00',
        unitCost: '50.00',
        totalCost: '500.00',
    } as any);

    console.log('Created SALE transaction (10 units)');

    // REFUND: 2 Units @ $100 (Total $200, Cost $100)
    const [refundTx] = await db.insert(transactions).values({
        storeId: store.id,
        cashierId: cashierId,
        status: 'completed',
        kind: 'REFUND',
        total: '200.00',
        subtotal: '200.00',
        taxAmount: '0.00',
        paymentMethod: 'cash',
        createdAt: new Date(),
    } as any).returning();

    await db.insert(transactionItems).values({
        transactionId: refundTx.id,
        productId: product.id,
        quantity: 2,
        unitPrice: '100.00',
        totalPrice: '200.00',
        unitCost: '50.00',
        totalCost: '100.00',
    } as any);

    console.log('Created REFUND transaction (2 units)');

    // STOCK LOSS: 1 Unit Damaged (Value $50)
    // Needs proper JSONb metadata
    await db.insert(inventoryRevaluationEvents).values({
        storeId: store.id,
        productId: product.id,
        occurredAt: new Date(),
        source: 'stock_removal_damaged',
        quantityBefore: 100,
        quantityAfter: 99,
        metadata: {
            lossAmount: 50.00,
            reason: 'Damaged in transit'
        }
    } as any);

    console.log('Created STOCK LOSS event (1 unit, $50 value)');

    // 3. Compute Profitability
    console.log('Running computeProductProfitability...');
    const results = await aiInsightsService.computeProductProfitability(store.id);

    const pData = results.find(r => r.productId === product.id);

    if (!pData) {
        throw new Error('Product not found in results');
    }

    console.log('--- Results ---');
    console.log(`Product: ${pData.productName} `);
    console.log(`Gross Revenue(Expect 1000): ${pData.grossRevenue} `);
    console.log(`Refunds(Expect 200): ${pData.refundedAmount} `);
    console.log(`Net Revenue(Expect 800): ${pData.netRevenue} `);
    console.log(`Gross COGS(Expect 500): ${pData.totalCost} `);
    console.log(`Net COGS(Expect 400): ${pData.netCost} `); // 500 - 100 refunded cost
    console.log(`Stock Loss(Expect 50): ${pData.stockLossAmount} `);

    // Expected Profit: Net Rev (800) - Net Cost (400) - Stock Loss (50) = 350
    console.log(`Total Profit(Expect 350): ${pData.totalProfit} `);

    const tolerance = 0.01;
    if (Math.abs(pData.totalProfit - 350) < tolerance) {
        console.log('✅ VERIFICATION PASSED');
    } else {
        console.error('❌ VERIFICATION FAILED');
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
