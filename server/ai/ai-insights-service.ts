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
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    profitMargin: number;
    avgProfitPerUnit: number;
    currentStock: number;
    saleVelocity: number;
    daysToStockout: number | null;
    trend: 'increasing' | 'decreasing' | 'stable';
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
     */
    async computeProductProfitability(storeId: string): Promise<ProductProfitabilityData[]> {
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - this.periodDays);

        // Half period for trend comparison
        const halfPeriodDate = new Date();
        halfPeriodDate.setDate(halfPeriodDate.getDate() - Math.floor(this.periodDays / 2));

        try {
            // Get sales data from transaction_items (which has unit_cost)
            const salesData = await db
                .select({
                    productId: transactionItems.productId,
                    productName: products.name,
                    quantity: sql<number>`SUM(${transactionItems.quantity})`,
                    revenue: sql<number>`SUM(${transactionItems.totalPrice})`,
                    cost: sql<number>`SUM(${transactionItems.totalCost})`,
                })
                .from(transactionItems)
                .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
                .innerJoin(products, eq(transactionItems.productId, products.id))
                .where(and(
                    eq(transactions.storeId, storeId),
                    eq(transactions.status, 'completed'),
                    gte(transactions.createdAt, lookbackDate)
                ))
                .groupBy(transactionItems.productId, products.name);

            // Get inventory data for current stock
            const inventoryData = await db
                .select({
                    productId: inventory.productId,
                    quantity: inventory.quantity,
                    minStockLevel: inventory.minStockLevel,
                    maxStockLevel: inventory.maxStockLevel,
                })
                .from(inventory)
                .where(eq(inventory.storeId, storeId));

            const inventoryMap = new Map(inventoryData.map(i => [i.productId, i]));

            // Get recent period sales for trend calculation
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
                    gte(transactions.createdAt, halfPeriodDate)
                ))
                .groupBy(transactionItems.productId);

            const recentSalesMap = new Map(recentSalesData.map(s => [s.productId, parseNumeric(s.quantity)]));

            // Compute profitability for each product
            const results: ProductProfitabilityData[] = [];

            for (const sale of salesData) {
                const unitsSold = parseNumeric(sale.quantity);
                const totalRevenue = parseNumeric(sale.revenue);
                const totalCost = parseNumeric(sale.cost);
                const totalProfit = totalRevenue - totalCost;
                const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) : 0;
                const avgProfitPerUnit = unitsSold > 0 ? (totalProfit / unitsSold) : 0;

                const inv = inventoryMap.get(sale.productId);
                const currentStock = inv ? parseNumeric(inv.quantity) : 0;

                // Sale velocity (units per day)
                const saleVelocity = unitsSold / this.periodDays;

                // Days to stockout
                const daysToStockout = saleVelocity > 0 ? Math.floor(currentStock / saleVelocity) : null;

                // Trend calculation
                const recentSales = recentSalesMap.get(sale.productId) || 0;
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

                results.push({
                    productId: sale.productId,
                    productName: sale.productName || 'Unknown',
                    unitsSold,
                    totalRevenue,
                    totalCost,
                    totalProfit,
                    profitMargin,
                    avgProfitPerUnit,
                    currentStock,
                    saleVelocity,
                    daysToStockout,
                    trend,
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
        return profitabilities
            .filter(p => p.currentStock > 0 || p.saleVelocity > 0)
            .map(p => {
                // Priority score formula:
                // Higher profit margin = higher priority
                // Lower days to stockout = higher priority
                // Higher velocity = higher priority

                let priorityScore = 0;

                // Profit margin contribution (0-40 points)
                priorityScore += Math.min(40, Math.max(0, p.profitMargin * 100));

                // Stockout urgency contribution (0-40 points)
                if (p.daysToStockout !== null) {
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
                if (p.daysToStockout !== null && p.daysToStockout <= 3) {
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
                totalRevenue: p.totalRevenue.toFixed(2),
                totalCost: p.totalCost.toFixed(4),
                totalProfit: p.totalProfit.toFixed(2),
                profitMargin: p.profitMargin.toFixed(4),
                avgProfitPerUnit: p.avgProfitPerUnit.toFixed(4),
                saleVelocity: p.saleVelocity.toFixed(4),
                daysToStockout: p.daysToStockout,
                removalCount: 0,
                removalLossValue: '0',
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
