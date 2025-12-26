/**
 * AI Insights API Routes
 * 
 * Provides endpoints for retrieving AI-generated insights and triggering insight generation.
 */

import { and, eq, desc } from 'drizzle-orm';
import { Express, Request, Response } from 'express';

import { aiBatchRuns, aiProductProfitability, inventory, products, stores } from '../../shared/schema';
import { aiInsightsService } from '../ai/ai-insights-service';
import { db } from '../db';
import { extractLogContext, logger } from '../lib/logger';
import { requireAuth, requireRole } from '../middleware/authz';

export async function registerAIInsightsRoutes(app: Express) {
    // Get all insights for a store
    app.get('/api/ai/insights/:storeId', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId } = req.params;
            const { type, severity, includeDismissed } = req.query;

            const insights = await aiInsightsService.getInsightsForStore(storeId, {
                type: type as string | undefined,
                severity: severity as string | undefined,
                includeDisimissed: includeDismissed === 'true',
            });

            // Group insights by type for easier frontend consumption
            const grouped = {
                topProfitable: insights.filter(i => i.insightType === 'TOP_PROFITABLE_PRODUCTS'),
                lossMaking: insights.filter(i => i.insightType === 'LOSS_MAKING_PRODUCTS'),
                removalPatterns: insights.filter(i => i.insightType === 'REMOVAL_PATTERN'),
                restockingPriority: insights.filter(i => i.insightType === 'RESTOCKING_PRIORITY'),
                stockRecommendations: insights.filter(i => i.insightType === 'STOCK_LEVEL_RECOMMENDATION'),
                other: insights.filter(i => !['TOP_PROFITABLE_PRODUCTS', 'LOSS_MAKING_PRODUCTS', 'REMOVAL_PATTERN', 'RESTOCKING_PRIORITY', 'STOCK_LEVEL_RECOMMENDATION'].includes(i.insightType)),
            };

            // Summary stats
            const summary = {
                total: insights.length,
                critical: insights.filter(i => i.severity === 'critical').length,
                warning: insights.filter(i => i.severity === 'warning').length,
                info: insights.filter(i => i.severity === 'info').length,
                actionable: insights.filter(i => i.isActionable).length,
            };

            res.json({
                success: true,
                storeId,
                insights,
                grouped,
                summary,
                generatedAt: insights[0]?.generatedAt || null,
            });
        } catch (error) {
            logger.error('Failed to get AI insights', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to retrieve insights' });
        }
    });

    // Get product-specific profitability data
    app.get('/api/ai/insights/:storeId/product/:productId', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId, productId } = req.params;

            const profitability = await aiInsightsService.getProductProfitability(storeId, productId);

            if (!profitability) {
                return res.status(404).json({ error: 'No profitability data found for this product' });
            }

            res.json({
                success: true,
                productId,
                profitability,
            });
        } catch (error) {
            logger.error('Failed to get product profitability', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to retrieve product profitability' });
        }
    });

    // Get restocking priority list
    app.get('/api/ai/insights/:storeId/restocking-priority', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId } = req.params;
            const limit = parseInt(req.query.limit as string) || 20;

            const priorities = await aiInsightsService.getRestockingPriority(storeId, limit);

            res.json({
                success: true,
                storeId,
                priorities,
                count: priorities.length,
            });
        } catch (error) {
            logger.error('Failed to get restocking priority', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to retrieve restocking priority' });
        }
    });

    // Get all product profitability data for a store
    app.get('/api/ai/insights/:storeId/profitability', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId } = req.params;
            const { sortBy = 'profit', order = 'desc', limit = '50', fresh = 'false' } = req.query;

            // If fresh=true or cache is empty, compute live data
            const useFreshData = fresh === 'true';

            if (useFreshData) {
                // Compute fresh profitability data directly (bypasses cache)
                const liveResults = await aiInsightsService.computeProductProfitability(storeId);

                // Sort and limit
                const sorted = [...liveResults].sort((a, b) => {
                    switch (sortBy) {
                        case 'revenue': return order === 'asc' ? a.grossRevenue - b.grossRevenue : b.grossRevenue - a.grossRevenue;
                        case 'velocity': return order === 'asc' ? a.saleVelocity - b.saleVelocity : b.saleVelocity - a.saleVelocity;
                        case 'margin': return order === 'asc' ? a.profitMargin - b.profitMargin : b.profitMargin - a.profitMargin;
                        default: return order === 'asc' ? a.totalProfit - b.totalProfit : b.totalProfit - a.totalProfit;
                    }
                }).slice(0, parseInt(limit as string));

                const formattedResults = sorted.map(r => ({
                    productId: r.productId,
                    productName: r.productName,
                    unitsSold: r.unitsSold,
                    totalRevenue: r.grossRevenue,
                    totalCost: r.totalCost,
                    totalProfit: r.totalProfit,
                    profitMargin: r.profitMargin,
                    avgProfitPerUnit: r.avgProfitPerUnit,
                    saleVelocity: r.saleVelocity,
                    daysToStockout: r.daysToStockout,
                    trend: r.trend,
                    currentStock: r.currentStock,
                    refundedAmount: r.refundedAmount,
                    stockLossAmount: r.stockLossAmount,
                }));

                return res.json({
                    success: true,
                    storeId,
                    products: formattedResults,
                    count: formattedResults.length,
                    source: 'live',
                });
            }

            // Otherwise use cached data
            const orderFn = (col: any) => order === 'asc' ? col : desc(col);

            let orderCol: any;
            switch (sortBy) {
                case 'revenue': orderCol = aiProductProfitability.totalRevenue; break;
                case 'velocity': orderCol = aiProductProfitability.saleVelocity; break;
                case 'margin': orderCol = aiProductProfitability.profitMargin; break;
                default: orderCol = aiProductProfitability.totalProfit;
            }

            const results = await db
                .select({
                    productId: aiProductProfitability.productId,
                    productName: products.name,
                    unitsSold: aiProductProfitability.unitsSold,
                    totalRevenue: aiProductProfitability.totalRevenue,
                    totalCost: aiProductProfitability.totalCost,
                    totalProfit: aiProductProfitability.totalProfit,
                    profitMargin: aiProductProfitability.profitMargin,
                    avgProfitPerUnit: aiProductProfitability.avgProfitPerUnit,
                    saleVelocity: aiProductProfitability.saleVelocity,
                    daysToStockout: aiProductProfitability.daysToStockout,
                    trend: aiProductProfitability.trend,
                    currentStock: inventory.quantity,
                    refundedAmount: aiProductProfitability.refundedAmount,
                    stockLossAmount: aiProductProfitability.removalLossValue,
                })
                .from(aiProductProfitability)
                .innerJoin(products, eq(aiProductProfitability.productId, products.id))
                .leftJoin(inventory, and(
                    eq(inventory.productId, products.id),
                    eq(inventory.storeId, storeId)
                ))
                .where(eq(aiProductProfitability.storeId, storeId))
                .orderBy(orderFn(orderCol))
                .limit(parseInt(limit as string));

            // If cache is empty, compute live as fallback
            if (results.length === 0) {
                const liveResults = await aiInsightsService.computeProductProfitability(storeId);
                const sorted = [...liveResults].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, parseInt(limit as string));

                const formattedResults = sorted.map(r => ({
                    productId: r.productId,
                    productName: r.productName,
                    unitsSold: r.unitsSold,
                    totalRevenue: r.grossRevenue,
                    totalCost: r.totalCost,
                    totalProfit: r.totalProfit,
                    profitMargin: r.profitMargin,
                    avgProfitPerUnit: r.avgProfitPerUnit,
                    saleVelocity: r.saleVelocity,
                    daysToStockout: r.daysToStockout,
                    trend: r.trend,
                    currentStock: r.currentStock,
                    refundedAmount: r.refundedAmount,
                    stockLossAmount: r.stockLossAmount,
                }));

                return res.json({
                    success: true,
                    storeId,
                    products: formattedResults,
                    count: formattedResults.length,
                    source: 'live',
                });
            }

            // Convert decimal strings to numbers for frontend consumption
            const formattedResults = results.map(r => ({
                ...r,
                totalRevenue: Number(r.totalRevenue),
                totalCost: Number(r.totalCost),
                totalProfit: Number(r.totalProfit),
                profitMargin: Number(r.profitMargin),
                avgProfitPerUnit: Number(r.avgProfitPerUnit),
                saleVelocity: Number(r.saleVelocity),
                currentStock: r.currentStock ?? 0,
                refundedAmount: Number(r.refundedAmount ?? 0),
                stockLossAmount: Number(r.stockLossAmount ?? 0),
            }));

            res.json({
                success: true,
                storeId,
                products: formattedResults,
                count: formattedResults.length,
                source: 'cache',
            });
        } catch (error) {
            logger.error('Failed to get profitability data', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to retrieve profitability data' });
        }
    });

    // Trigger insight generation for a store (admin only)
    app.post('/api/ai/insights/generate', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
        try {
            const { storeId, orgId } = req.body;
            const context = extractLogContext(req);

            if (!storeId && !orgId) {
                return res.status(400).json({ error: 'Either storeId or orgId is required' });
            }

            logger.info('Manual AI insight generation triggered', { ...context, storeId, orgId });

            // If orgId provided, generate for all stores in org
            if (orgId) {
                const orgStores = await db
                    .select({ id: stores.id })
                    .from(stores)
                    .where(eq(stores.orgId, orgId));

                // Create batch run record
                const [batchRun] = await db.insert(aiBatchRuns).values({
                    orgId,
                    status: 'running',
                    startedAt: new Date(),
                } as any).returning();

                // Generate insights for each store (in background)
                const results = [];
                for (const store of orgStores) {
                    const result = await aiInsightsService.generateInsightsForStore(store.id);
                    results.push(result);
                }

                // Update batch run
                const totalInsights = results.reduce((sum, r) => sum + r.insightsGenerated, 0);
                const hasErrors = results.some(r => r.errors.length > 0);

                await db.update(aiBatchRuns)
                    .set({
                        status: hasErrors ? 'completed_with_errors' : 'completed',
                        storesProcessed: orgStores.length,
                        insightsGenerated: totalInsights,
                        completedAt: new Date(),
                        errorMessage: hasErrors ? results.flatMap(r => r.errors).join('; ') : null,
                    } as any)
                    .where(eq(aiBatchRuns.id, batchRun.id));

                return res.json({
                    success: true,
                    batchRunId: batchRun.id,
                    storesProcessed: orgStores.length,
                    insightsGenerated: totalInsights,
                    results,
                });
            }

            // Single store generation
            const result = await aiInsightsService.generateInsightsForStore(storeId);

            res.json({
                success: true,
                ...result,
            });
        } catch (error) {
            logger.error('Failed to generate AI insights', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to generate insights' });
        }
    });

    // Dismiss an insight
    app.post('/api/ai/insights/:insightId/dismiss', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { insightId } = req.params;
            const userId = (req.session as any)?.userId;

            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            await aiInsightsService.dismissInsight(insightId, userId);

            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to dismiss insight', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to dismiss insight' });
        }
    });

    // Get batch run history (admin only)
    app.get('/api/ai/batch-runs', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
        try {
            const { orgId, limit = '10' } = req.query;

            let query = db.select().from(aiBatchRuns);

            if (orgId) {
                query = query.where(eq(aiBatchRuns.orgId, orgId as string)) as any;
            }

            const runs = await query
                .orderBy(desc(aiBatchRuns.createdAt))
                .limit(parseInt(limit as string));

            res.json({
                success: true,
                runs,
            });
        } catch (error) {
            logger.error('Failed to get batch runs', extractLogContext(req), error as Error);
            res.status(500).json({ error: 'Failed to retrieve batch runs' });
        }
    });

    logger.info('AI Insights routes registered');
}
