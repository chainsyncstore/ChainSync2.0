
import { aiInsightsService } from '../server/ai/ai-insights-service';
import type { ProductProfitabilityData } from '../server/ai/ai-insights-service';

function testRestockingLogic() {
    console.log('Testing Restocking Priority Logic...');

    const mockData: ProductProfitabilityData[] = [
        {
            productId: 'p1',
            productName: 'OOS High Margin',
            currentStock: 0,
            saleVelocity: 2,
            profitMargin: 0.5, // 50%
            daysToStockout: 0,
            // ... (other fields irrelevant for this test)
            netRevenue: 1000, grossRevenue: 1000, totalTax: 0, totalCost: 500, netCost: 500,
            refundedAmount: 0, refundedTax: 0, refundedQuantity: 0,
            unitsSold: 20, stockLossAmount: 0, totalProfit: 500, avgProfitPerUnit: 25,
            trend: 'stable'
        },
        {
            productId: 'p2',
            productName: 'Low Stock High Margin',
            currentStock: 2,
            saleVelocity: 2,
            profitMargin: 0.5, // 50%
            daysToStockout: 1, // <= 3 days
            // ...
            netRevenue: 1000, grossRevenue: 1000, totalTax: 0, totalCost: 500, netCost: 500,
            refundedAmount: 0, refundedTax: 0, refundedQuantity: 0,
            unitsSold: 20, stockLossAmount: 0, totalProfit: 500, avgProfitPerUnit: 25,
            trend: 'stable'
        },
        {
            productId: 'p3',
            productName: 'OOS Low Margin',
            currentStock: 0,
            saleVelocity: 2,
            profitMargin: 0.1, // 10%
            daysToStockout: 0,
            // ...
            netRevenue: 1000, grossRevenue: 1000, totalTax: 0, totalCost: 900, netCost: 900,
            refundedAmount: 0, refundedTax: 0, refundedQuantity: 0,
            unitsSold: 20, stockLossAmount: 0, totalProfit: 100, avgProfitPerUnit: 5,
            trend: 'stable'
        },
    ];

    const results = aiInsightsService.calculateRestockingPriority(mockData);

    console.log('\n--- Priority List ---');
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.productName}`);
        console.log(`   Score: ${r.priorityScore}`);
        console.log(`   Recommendation: ${r.recommendation}`);
        console.log(`   Stock: ${r.currentStock}`);
    });

    // Validations
    console.log('\n--- Validations ---');

    // 1. OOS wording
    const oosItem = results.find(r => r.productName === 'OOS High Margin');
    if (oosItem?.recommendation.includes('Item Out of Stock')) {
        console.log('✅ OOS Wording Correct');
    } else {
        console.error('❌ OOS Wording Incorrect:', oosItem?.recommendation);
    }

    // 2. Priority Order: OOS High Profit > OOS Low Profit (Tie-breaker worked?)
    // Note: OOS Score (50) + Margin Score (40 vs 10) + Velocity (15) 
    // p1 = 50 + 40 + 15 = 105
    // p2 = 40 + 40 + 15 = 95
    // p3 = 50 + 10 + 15 = 75
    // Order should be p1, p2, p3 OR p1, p3, p2?
    // Let's check p3 score. OOS (50) + Margin(10) + Velocity(15) = 75.
    // p2 score: LowStock(40) + Margin(40) + Velocity(15) = 95.
    // So p2 (Low Stock High Margin) > p3 (OOS Low Margin).
    // This is valid: A high margin item pending stockout is more valuable than a low margin item already lost? 
    // Or did user want ALL OOS > Low Stock?
    // User said: "Boost priority score for Out-of-Stock items".
    // 50 vs 40 is a boost.
    // Validating current logic outcome.

    if (results[0].productId === 'p1') {
        console.log('✅ Highest Priority correct (OOS High Margin)');
    } else {
        console.error('❌ Highest Priority wrong:', results[0].productName);
    }

}

testRestockingLogic();
