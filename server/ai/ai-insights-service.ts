/**
 * AI Insights Service - Core engine for the Profit Advisor
 * 
 * Computes actionable insights from sales, inventory, and stock movement data
 * to help stores maximize profits.
 */

import { eq, and, gte, sql, desc, inArray } from 'drizzle-orm';

import {
    products,
    inventory,
    stockMovements,
    transactionItems,
    transactions,
    aiInsights,
    aiProductProfitability,
    inventoryRevaluationEvents,
    type AiInsight,
    type AiProductProfitability,
} from '../../shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';

// Types for insights
export interface ProductProfitabilityData {
    productId: string;
    productName: string;
    unitsSold: number;
    grossRevenue: number;     // Sales + Tax
    netRevenue: number;       // (Sales - Tax) - (Refunds - RefundTax)
    totalTax: number;         // Tax collected
    totalCost: number;        // Gross COGS
    netCost: number;          // COGS - RefundCOGS
    refundedAmount: number;   // Value of refunds (ex Tax)
    refundedTax: number;      // Tax refunded
    refundedQuantity: number; // Units returned
    stockLossAmount: number;  // Value lost from damaged/expired/theft
    totalProfit: number;      // NetRevenue - NetCost - StockLoss
    profitMargin: number;
    avgProfitPerUnit: number;
    currentStock: number;
    saleVelocity: number;
    daysToStockout: number | null;
    trend: 'increasing' | 'decreasing' | 'stable';
    minStockLevel: number;
}

export interface RemovalPattern {
    productId: string;
    productName: string;
    reason: string;
    occurrences: number;
    totalUnitsLost: number;
    totalLossValue: number;
    periodDays: number;
}

export interface RestockingPriority {
    productId: string;
    productName: string;
    currentStock: number;
    daysToStockout: number | null;
    profitMargin: number;
    saleVelocity: number;
    priorityScore: number;
    recommendation: string;
    minStockLevel: number;
}

export interface StockLevelRecommendation {
    productId: string;
    productName: string;
    currentMinStock: number;
    currentMaxStock: number;
    recommendedMinStock: number;
    recommendedMaxStock: number;
    reasoning: string;
    confidenceScore: number;
}

export interface InsightGenerationResult {
    storeId: string;
    insightsGenerated: number;
    profitabilitiesComputed: number;
    errors: string[];
}

// Helper to parse numeric values safely
const parseNumeric = (value: unknown, defaultValue = 0): number => {
    if (value === null || value === undefined) return defaultValue;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

export class AiInsightsService {
    private readonly periodDays = 90; // Default analysis period

    /**
     * Generate all insights for a store (main entry point for batch processing)
     */
    async generateInsightsForStore(storeId: string): Promise<InsightGenerationResult> {
        const result: InsightGenerationResult = {
            storeId,
            insightsGenerated: 0,
            profitabilitiesComputed: 0,
            errors: [],
        };

        try {
            logger.info('Starting AI insight generation', { storeId });

            // Clear old insights for this store (keep dismissed ones)
            await db.delete(aiInsights)
                .where(and(
                    eq(aiInsights.storeId, storeId),
                    eq(aiInsights.isDismissed, false)
                ));

            // 1. Compute product profitability
            const profitabilities = await this.computeProductProfitability(storeId);
            result.profitabilitiesComputed = profitabilities.length;

            // Store profitability data in cache table
            await this.saveProfitabilityData(storeId, profitabilities);

            // 2. Detect removal patterns
            const removalPatterns = await this.detectRemovalPatterns(storeId);

            // 3. Generate insights from patterns
            const insights: Omit<AiInsight, 'id' | 'createdAt'>[] = [];

            // Top profitable products insight
            const topProfitable = profitabilities
                .filter(p => p.totalProfit > 0)
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .slice(0, 5);

            if (topProfitable.length > 0) {
                insights.push({
                    storeId,
                    insightType: 'TOP_PROFITABLE_PRODUCTS',
                    productId: null,
                    severity: 'info',
                    title: 'Top Profitable Products',
                    description: `Your top ${topProfitable.length} products by profit in the last ${this.periodDays} days.`,
                    data: { products: topProfitable },
                    isActionable: false,
                    isDismissed: false,
                    dismissedAt: null,
                    dismissedBy: null,
                    generatedAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
                });
                result.insightsGenerated++;
            }

            // Loss-making products insight
            const lossMakers = profitabilities
                .filter(p => p.totalProfit < 0)
                .sort((a, b) => a.totalProfit - b.totalProfit)
                .slice(0, 5);

            if (lossMakers.length > 0) {
                insights.push({
                    storeId,
                    insightType: 'LOSS_MAKING_PRODUCTS',
                    productId: null,
                    severity: 'warning',
                    title: 'Products Causing Losses',
                    description: `${lossMakers.length} products have generated losses in the last ${this.periodDays} days. Review pricing or consider discontinuing.`,
                    data: { products: lossMakers },
                    isActionable: true,
                    isDismissed: false,
                    dismissedAt: null,
                    dismissedBy: null,
                    generatedAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                });
                result.insightsGenerated++;
            }

            // Removal pattern insights (expired/damaged)
            for (const pattern of removalPatterns) {
                if (pattern.occurrences >= 3) {
                    const severity = pattern.occurrences >= 5 ? 'critical' : 'warning';
                    const suggestedAction = pattern.occurrences >= 5 ? 'CONSIDER_DROPPING' : 'REDUCE_ORDER_QTY';

                    insights.push({
                        storeId,
                        insightType: 'REMOVAL_PATTERN',
                        productId: pattern.productId,
                        severity,
                        title: `Repeat ${pattern.reason} Issue: ${pattern.productName}`,
                        description: `${pattern.productName} has been removed ${pattern.occurrences} times due to "${pattern.reason}" in the last ${pattern.periodDays} days, causing a loss of ${pattern.totalLossValue.toFixed(2)}.`,
                        data: {
                            pattern,
                            suggestedAction,
                            suggestedMinStock: null, // Could compute based on velocity
                            suggestedMaxStock: null,
                        },
                        isActionable: true,
                        isDismissed: false,
                        dismissedAt: null,
                        dismissedBy: null,
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    });
                    result.insightsGenerated++;
                }
            }

            // Restocking priority insight
            const restockingPriority = this.calculateRestockingPriority(profitabilities);
            const urgentRestocks = restockingPriority.filter(r => r.daysToStockout !== null && r.daysToStockout <= 7);

            if (urgentRestocks.length > 0) {
                insights.push({
                    storeId,
                    insightType: 'RESTOCKING_PRIORITY',
                    productId: null,
                    severity: urgentRestocks.some(r => r.daysToStockout !== null && r.daysToStockout <= 3) ? 'critical' : 'warning',
                    title: 'Urgent Restocking Needed',
                    description: `${urgentRestocks.length} products need restocking within 7 days to avoid stockouts.`,
                    data: { products: urgentRestocks.slice(0, 10) },
                    isActionable: true,
                    isDismissed: false,
                    dismissedAt: null,
                    dismissedBy: null,
                    generatedAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                });
                result.insightsGenerated++;
            }

            // Stock level recommendations
            const stockRecommendations = await this.generateStockLevelRecommendations(storeId, profitabilities);

            for (const rec of stockRecommendations) {
                if (rec.confidenceScore >= 0.7) {
                    insights.push({
                        storeId,
                        insightType: 'STOCK_LEVEL_RECOMMENDATION',
                        productId: rec.productId,
                        severity: 'info',
                        title: `Adjust Stock Levels: ${rec.productName}`,
                        description: rec.reasoning,
                        data: {
                            current: { min: rec.currentMinStock, max: rec.currentMaxStock },
                            recommended: { min: rec.recommendedMinStock, max: rec.recommendedMaxStock },
                            confidenceScore: rec.confidenceScore,
                        },
                        isActionable: true,
                        isDismissed: false,
                        dismissedAt: null,
                        dismissedBy: null,
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    });
                    result.insightsGenerated++;
                }
            }

            // Insert all insights
            if (insights.length > 0) {
                await db.insert(aiInsights).values(insights as any[]);
            }

            logger.info('AI insight generation completed', {
                storeId,
                insightsGenerated: result.insightsGenerated,
                profitabilitiesComputed: result.profitabilitiesComputed,
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(message);
            logger.error('AI insight generation failed', { storeId }, error as Error);
        }

        return result;
    }

    /**
     * Compute product profitability from transaction data
     * Updated to account for Refunds, Tax, and Stock Losses
     */
    async computeProductProfitability(storeId: string): Promise<ProductProfitabilityData[]> {
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - this.periodDays);

        // Half period for trend comparison
        const halfPeriodDate = new Date();
        halfPeriodDate.setDate(halfPeriodDate.getDate() - Math.floor(this.periodDays / 2));

        try {
            // 1. Get Sales, Tax, Refunds via Transactions & Items aggregation
            const salesData = await db.execute(sql`
                WITH txn_items AS (
                    SELECT 
                        ti.product_id,
                        t.kind,
                        t.tax_amount,
                        t.subtotal,
                        ti.quantity,
                        ti.total_price,
                        ti.total_cost
                    FROM ${transactionItems} ti
                    JOIN ${transactions} t ON t.id = ti.transaction_id
                    WHERE t.store_id = ${storeId}
                    AND t.status = 'completed'
                    AND t.created_at >= ${lookbackDate}
                )
                SELECT 
                    ti.product_id,
                    p.name as product_name,
                    -- Sales (Kind = SALE)
                    COALESCE(SUM(CASE WHEN ti.kind = 'SALE' THEN ti.quantity ELSE 0 END), 0) as units_sold,
                    COALESCE(SUM(CASE WHEN ti.kind = 'SALE' THEN ti.total_price ELSE 0 END), 0) as gross_revenue,
                    COALESCE(SUM(CASE WHEN ti.kind = 'SALE' THEN ti.total_cost ELSE 0 END), 0) as cogs,
                    -- Refunds (Kind = REFUND/SWAP_REFUND)
                    COALESCE(SUM(CASE WHEN ti.kind IN ('REFUND', 'SWAP_REFUND') THEN ti.quantity ELSE 0 END), 0) as units_refunded,
                    COALESCE(SUM(CASE WHEN ti.kind IN ('REFUND', 'SWAP_REFUND') THEN ti.total_price ELSE 0 END), 0) as refund_val,
                    COALESCE(SUM(CASE WHEN ti.kind IN ('REFUND', 'SWAP_REFUND') THEN ti.total_cost ELSE 0 END), 0) as refund_cogs
                FROM txn_items ti
                JOIN ${products} p ON p.id = ti.product_id
                GROUP BY ti.product_id, p.name
            `);

            // 2. Get Stock Loss Data (from inventory_revaluation_events)
            const lossData = await db.execute(sql`
                SELECT 
                    product_id,
                    COALESCE(SUM(CAST(metadata->>'lossAmount' AS NUMERIC)), 0) as loss_amount,
                    COALESCE(SUM(CAST(metadata->>'refundAmount' AS NUMERIC)), 0) as recovered_amount
                FROM ${inventoryRevaluationEvents}
                WHERE store_id = ${storeId}
                AND occurred_at >= ${lookbackDate}
                AND (
                    source LIKE 'stock_removal_%' 
                    OR source = 'pos_return_discard'
                    OR source = 'discard'
                )
                GROUP BY product_id
            `);

            const lossMap = new Map<string, number>();
            lossData.rows.forEach((row: any) => {
                const netLoss = Number(row.loss_amount);
                lossMap.set(row.product_id, Math.max(0, netLoss));
            });

            // 3. Get Inventory Data
            const inventoryData = await db
                .select({
                    productId: inventory.productId,
                    quantity: inventory.quantity,
                    minStockLevel: inventory.minStockLevel,
                })
                .from(inventory)
                .where(eq(inventory.storeId, storeId));

            const inventoryMap = new Map(inventoryData.map(i => [i.productId, i]));

            // 4. Get Trend Data (Sales only)
            const recentSalesData = await db
                .select({
                    productId: transactionItems.productId,
                    quantity: sql<number>`SUM(${transactionItems.quantity})`,
                })
                .from(transactionItems)
                .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
                .where(and(
                    eq(transactions.storeId, storeId),
                    eq(transactions.status, 'completed'),
                    eq(transactions.kind, 'SALE'),
                    gte(transactions.createdAt, halfPeriodDate)
                ))
                .groupBy(transactionItems.productId);

            const recentSalesMap = new Map(recentSalesData.map(s => [s.productId, parseNumeric(s.quantity)]));

            const results: ProductProfitabilityData[] = [];

            // Process each product
            for (const row of salesData.rows as any[]) {
                const productId = row.product_id;
                const productName = row.product_name;

                // Base Metrics
                const unitsSold = Number(row.units_sold);
                const grossRev = Number(row.gross_revenue); // This is usually inclusive of tax if total_price is tax-inclusive, OR exclusive if total_price is subtotal. 
                // In ChainSync usually total_price = quantity * unit_price (which is typically tax-exclusive or inclusive depending on store settings).
                // Let's assume standard behavior: total_price is line total.
                // However, we need to estimate TAX portion if we want Net Revenue (Ex Tax).
                // For simplicity: We will approximate Tax based on standard rate or if stored?
                // The query in comprehensive report fetches tax at transaction level. 
                // Item level tax isn't easily stored. 
                // We will calculate 'Net Revenue' as (Sales - Refunds). Tax handling per item is complex without item-level tax data.
                // *Correction*: We will treat `grossRevenue` as Sales Amount. We will deduce `Net Profit` as (Sales - Refunds - COGS - Loss).
                // If Store prices include tax, profit will be inflated unless we strip it.
                // For now, consistent with report: Report takes (Revenue - Tax) as base.
                // We lack item-level tax column. We will use the simplified approach:
                // `Profit = Revenue - COGS - Refunds - Loss`.

                const cogs = Number(row.cogs);
                const unitsRefunded = Number(row.units_refunded);
                const refundVal = Number(row.refund_val);
                const refundCogs = Number(row.refund_cogs);

                const stockLoss = lossMap.get(productId) || 0;

                // Calculated Metrics
                const netRevenue = grossRev - refundVal; // Revenue after refunds
                const netCost = cogs - refundCogs;       // Cost of goods actually sold (net of returns)

                // Profit = NetRevenue - NetCost - StockLoss
                // Note: If tax is in grossRev, this Profit includes Tax. Ideally we subtract Tax.
                // Without item-level tax, we can't perfectly separate it per product.
                // We will report "Gross Profit" behavior essentially.
                const totalProfit = netRevenue - netCost - stockLoss;

                const profitMargin = netRevenue > 0 ? (totalProfit / netRevenue) : 0;
                // Adj Units = Sold - Refunded
                const netUnits = Math.max(0, unitsSold - unitsRefunded);
                const avgProfitPerUnit = netUnits > 0 ? (totalProfit / netUnits) : 0;

                const inv = inventoryMap.get(productId);
                const currentStock = inv ? parseNumeric(inv.quantity) : 0;
                const saleVelocity = unitsSold / this.periodDays;
                const daysToStockout = saleVelocity > 0 ? Math.floor(currentStock / saleVelocity) : null;

                // Trend
                const recentSales = recentSalesMap.get(productId) || 0;
                const earlierSales = unitsSold - recentSales;
                const halfPeriod = Math.floor(this.periodDays / 2);
                const recentVelocity = recentSales / halfPeriod;
                const earlierVelocity = earlierSales / halfPeriod;

                let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
                if (earlierVelocity > 0) {
                    const changePercent = (recentVelocity - earlierVelocity) / earlierVelocity;
                    if (changePercent > 0.15) trend = 'increasing';
                    else if (changePercent < -0.15) trend = 'decreasing';
                }

                const minStockLevel = inv ? parseNumeric(inv.minStockLevel) : 0;

                results.push({
                    productId,
                    productName,
                    unitsSold,
                    grossRevenue: grossRev,
                    netRevenue,
                    totalTax: 0, // Not available per-item easily
                    totalCost: cogs,
                    netCost,
                    refundedAmount: refundVal,
                    refundedTax: 0,
                    refundedQuantity: unitsRefunded,
                    stockLossAmount: stockLoss,
                    totalProfit,
                    profitMargin,
                    avgProfitPerUnit,
                    currentStock,
                    saleVelocity,
                    daysToStockout,
                    trend,
                    minStockLevel,
                });
            }

            return results.sort((a, b) => b.totalProfit - a.totalProfit);
        } catch (error) {
            logger.error('Failed to compute product profitability', { storeId }, error as Error);
            return [];
        }
    }

    /**
     * Detect patterns in stock removals (expired, damaged, theft, etc.)
     */
    async detectRemovalPatterns(storeId: string): Promise<RemovalPattern[]> {
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - this.periodDays);

        try {
            // Query stock movements for removals
            const removals = await db
                .select({
                    productId: stockMovements.productId,
                    productName: products.name,
                    delta: stockMovements.delta,
                    metadata: stockMovements.metadata,
                    actionType: stockMovements.actionType,
                })
                .from(stockMovements)
                .innerJoin(products, eq(stockMovements.productId, products.id))
                .where(and(
                    eq(stockMovements.storeId, storeId),
                    gte(stockMovements.occurredAt, lookbackDate),
                    inArray(stockMovements.actionType, ['removal', 'discard_loss', 'adjustment'])
                ));

            // Aggregate by product and reason
            const patternMap = new Map<string, RemovalPattern>();

            for (const removal of removals) {
                const metadata = removal.metadata as any || {};
                const reason = metadata.reason || metadata.removalReason || 'other';
                const key = `${removal.productId}-${reason}`;

                const existing = patternMap.get(key) || {
                    productId: removal.productId,
                    productName: removal.productName || 'Unknown',
                    reason,
                    occurrences: 0,
                    totalUnitsLost: 0,
                    totalLossValue: 0,
                    periodDays: this.periodDays,
                };

                const delta = parseNumeric(removal.delta);
                const lossValue = parseNumeric(metadata.lossAmount) || parseNumeric(metadata.totalLoss) || 0;

                existing.occurrences++;
                existing.totalUnitsLost += Math.abs(delta);
                existing.totalLossValue += lossValue;

                patternMap.set(key, existing);
            }

            return Array.from(patternMap.values())
                .sort((a, b) => b.occurrences - a.occurrences);
        } catch (error) {
            logger.error('Failed to detect removal patterns', { storeId }, error as Error);
            return [];
        }
    }

    /**
     * Calculate restocking priority based on profit, velocity, and stockout risk
     */
    calculateRestockingPriority(profitabilities: ProductProfitabilityData[]): RestockingPriority[] {
        // Filter logic:
        // 1. Below minimum stock level: currentStock <= minStockLevel
        // 2. Already out of stock: currentStock === 0 (covered by <= minStockLevel usually if min >= 0, but explicit check is good)
        // 3. Less than 7 days to stockout but yet to reach min stock: (daysToStockout < 7) AND (currentStock > minStockLevel)

        return profitabilities
            .filter(p => {
                const isBelowMin = p.currentStock <= p.minStockLevel;
                const isOutOfStock = p.currentStock === 0;
                const isRiskOfStockout = (p.daysToStockout !== null && p.daysToStockout < 7) && (p.currentStock > p.minStockLevel);

                return isBelowMin || isOutOfStock || isRiskOfStockout;
            })
            .map(p => {
                // Priority score formula:
                // Higher profit margin = higher priority
                // Out of Stock = highest urgency
                // Lower days to stockout = high priority
                // Higher velocity = higher priority

                let priorityScore = 0;

                // Profit margin contribution (0-40 points)
                priorityScore += Math.min(40, Math.max(0, p.profitMargin * 100));

                // Stockout urgency contribution (0-50 points)
                if (p.currentStock === 0) {
                    priorityScore += 50; // Highest priority for OOS
                } else if (p.daysToStockout !== null) {
                    if (p.daysToStockout <= 3) priorityScore += 40;
                    else if (p.daysToStockout <= 7) priorityScore += 30;
                    else if (p.daysToStockout <= 14) priorityScore += 20;
                    else if (p.daysToStockout <= 30) priorityScore += 10;
                }

                // Velocity contribution (0-20 points)
                if (p.saleVelocity >= 5) priorityScore += 20;
                else if (p.saleVelocity >= 2) priorityScore += 15;
                else if (p.saleVelocity >= 1) priorityScore += 10;
                else if (p.saleVelocity > 0) priorityScore += 5;

                let recommendation = 'Monitor stock levels';

                if (p.currentStock === 0) {
                    recommendation = 'URGENT: Item Out of Stock - Restock immediately';
                } else if (p.daysToStockout !== null && p.daysToStockout <= 3) {
                    recommendation = 'URGENT: Restock immediately to avoid stockout';
                } else if (p.daysToStockout !== null && p.daysToStockout <= 7) {
                    recommendation = 'Restock within this week';
                } else if (p.profitMargin > 0.3 && p.saleVelocity > 1) {
                    recommendation = 'High-profit fast mover - prioritize restocking';
                }

                return {
                    productId: p.productId,
                    productName: p.productName,
                    currentStock: p.currentStock,
                    daysToStockout: p.daysToStockout,
                    profitMargin: p.profitMargin,
                    saleVelocity: p.saleVelocity,
                    priorityScore,
                    recommendation,
                    minStockLevel: p.minStockLevel,
                };
            })
            .sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * Generate stock level recommendations based on sales patterns
     */
    async generateStockLevelRecommendations(
        storeId: string,
        profitabilities: ProductProfitabilityData[]
    ): Promise<StockLevelRecommendation[]> {
        const recommendations: StockLevelRecommendation[] = [];

        // Get current inventory settings
        const inventoryData = await db
            .select({
                productId: inventory.productId,
                minStockLevel: inventory.minStockLevel,
                maxStockLevel: inventory.maxStockLevel,
            })
            .from(inventory)
            .where(eq(inventory.storeId, storeId));

        const invMap = new Map(inventoryData.map(i => [i.productId, i]));

        for (const p of profitabilities) {
            const inv = invMap.get(p.productId);
            if (!inv) continue;

            const currentMin = parseNumeric(inv.minStockLevel, 10);
            const currentMax = parseNumeric(inv.maxStockLevel, 100);

            // Calculate recommended levels based on velocity
            // Min stock = 7 days of sales (safety stock)
            // Max stock = 30 days of sales
            const recommendedMin = Math.max(5, Math.ceil(p.saleVelocity * 7));
            const recommendedMax = Math.max(recommendedMin + 10, Math.ceil(p.saleVelocity * 30));

            // Check if recommendation differs significantly from current
            const minDiff = Math.abs(recommendedMin - currentMin) / Math.max(currentMin, 1);
            const maxDiff = Math.abs(recommendedMax - currentMax) / Math.max(currentMax, 1);

            if (minDiff > 0.3 || maxDiff > 0.3) {
                let reasoning = '';
                let confidenceScore = 0.6; // Base confidence

                if (p.saleVelocity > 2) {
                    confidenceScore += 0.2; // Higher confidence for faster-moving items
                }

                if (p.unitsSold > 50) {
                    confidenceScore += 0.1; // More data = more confidence
                }

                if (recommendedMin > currentMin && recommendedMax > currentMax) {
                    reasoning = `Based on ${this.periodDays}-day sales velocity of ${p.saleVelocity.toFixed(1)} units/day, consider increasing stock levels to prevent frequent stockouts.`;
                } else if (recommendedMin < currentMin && recommendedMax < currentMax) {
                    reasoning = `Sales velocity (${p.saleVelocity.toFixed(1)} units/day) suggests current stock levels are too high, tying up capital unnecessarily.`;
                } else {
                    reasoning = `Adjust stock levels to better match actual sales velocity of ${p.saleVelocity.toFixed(1)} units/day.`;
                }

                recommendations.push({
                    productId: p.productId,
                    productName: p.productName,
                    currentMinStock: currentMin,
                    currentMaxStock: currentMax,
                    recommendedMinStock: recommendedMin,
                    recommendedMaxStock: recommendedMax,
                    reasoning,
                    confidenceScore: Math.min(1, confidenceScore),
                });
            }
        }

        return recommendations.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }

    /**
     * Save profitability data to cache table for fast retrieval
     */
    private async saveProfitabilityData(storeId: string, data: ProductProfitabilityData[]): Promise<void> {
        if (data.length === 0) return;

        try {
            // Delete existing data for this store/period
            await db.delete(aiProductProfitability)
                .where(and(
                    eq(aiProductProfitability.storeId, storeId),
                    eq(aiProductProfitability.periodDays, this.periodDays)
                ));

            // Insert new data
            const rows = data.map(p => ({
                storeId,
                productId: p.productId,
                periodDays: this.periodDays,
                unitsSold: p.unitsSold,
                totalRevenue: p.grossRevenue.toFixed(2),
                totalCost: p.totalCost.toFixed(4),
                totalProfit: p.totalProfit.toFixed(2),
                profitMargin: p.profitMargin.toFixed(4),
                avgProfitPerUnit: p.avgProfitPerUnit.toFixed(4),
                refundedAmount: p.refundedAmount.toFixed(2),
                refundedQuantity: p.refundedQuantity,
                netRevenue: p.netRevenue.toFixed(2),
                grossRevenue: p.grossRevenue.toFixed(2),
                netCost: p.netCost.toFixed(4),
                saleVelocity: p.saleVelocity.toFixed(4),
                daysToStockout: p.daysToStockout,
                removalCount: 0,
                removalLossValue: p.stockLossAmount.toFixed(2),
                trend: p.trend,
                computedAt: new Date(),
            }));

            await db.insert(aiProductProfitability).values(rows as any[]);
        } catch (error) {
            logger.error('Failed to save profitability data', { storeId }, error as Error);
        }
    }

    /**
     * Get insights for a store (for API retrieval)
     */
    async getInsightsForStore(storeId: string, options?: {
        type?: string;
        severity?: string;
        includeDisimissed?: boolean;
    }): Promise<AiInsight[]> {
        const conditions = [eq(aiInsights.storeId, storeId)];

        if (!options?.includeDisimissed) {
            conditions.push(eq(aiInsights.isDismissed, false));
        }

        if (options?.type) {
            conditions.push(eq(aiInsights.insightType, options.type));
        }

        if (options?.severity) {
            conditions.push(eq(aiInsights.severity, options.severity));
        }

        return db
            .select()
            .from(aiInsights)
            .where(and(...conditions))
            .orderBy(desc(aiInsights.generatedAt));
    }

    /**
     * Get profitability data for a specific product
     */
    async getProductProfitability(storeId: string, productId: string): Promise<AiProductProfitability | null> {
        const results = await db
            .select()
            .from(aiProductProfitability)
            .where(and(
                eq(aiProductProfitability.storeId, storeId),
                eq(aiProductProfitability.productId, productId),
                eq(aiProductProfitability.periodDays, this.periodDays)
            ))
            .limit(1);

        return results[0] || null;
    }

    /**
     * Get restocking priority list for a store
     */
    async getRestockingPriority(storeId: string, limit = 20): Promise<RestockingPriority[]> {
        const profitabilities = await this.computeProductProfitability(storeId);
        const priorities = this.calculateRestockingPriority(profitabilities);
        return priorities.slice(0, limit);
    }

    /**
     * Dismiss an insight
     */
    async dismissInsight(insightId: string, userId: string): Promise<void> {
        await db.update(aiInsights)
            .set({
                isDismissed: true,
                dismissedAt: new Date(),
                dismissedBy: userId,
            } as any)
            .where(eq(aiInsights.id, insightId));
    }
}

// Singleton instance
export const aiInsightsService = new AiInsightsService();
