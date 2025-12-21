/**
 * Comprehensive Sales Analytics Report Export
 * 
 * Aggregates sales data including timeseries, profit/loss, and top products
 * for a comprehensive downloadable HTML report with interactive charts.
 */

import { eq, gte, lte, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import type { CurrencyCode, Money } from '@shared/lib/currency';
import { legacySales as sales, legacyReturns as returns, users, userRoles, stores } from '@shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth } from '../middleware/authz';
import { requireActiveSubscription } from '../middleware/subscription';
import { storage } from '../storage';

const SUPPORTED_CURRENCY_SET = new Set<CurrencyCode>(['NGN', 'USD']);

const roundAmount = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

const toMoney = (amount: number, currency: CurrencyCode): Money => ({
    amount: roundAmount(amount),
    currency,
});

const coerceCurrency = (value: string | null | undefined, fallback: CurrencyCode): CurrencyCode => {
    const upper = (value || '').toUpperCase();
    return SUPPORTED_CURRENCY_SET.has(upper as CurrencyCode) ? (upper as CurrencyCode) : fallback;
};



async function getScope(req: Request) {
    let userId = (req.session as any)?.userId as string | undefined;
    if (!userId && process.env.NODE_ENV === 'test') {
        const anyUser = await db.select().from(users).limit(1);
        userId = anyUser[0]?.id as string | undefined;
    }
    if (!userId) {
        const qStoreId = (String((req.query as any)?.store_id || '').trim() || undefined) as string | undefined;
        if (qStoreId) {
            const s = await db.select().from(stores).where(eq(stores.id, qStoreId));
            const orgId = s[0]?.orgId as string | undefined;
            if (orgId) return { orgId, allowedStoreIds: [qStoreId], isAdmin: true };
        }
        return { orgId: undefined as string | undefined, allowedStoreIds: [] as string[], isAdmin: false };
    }
    const [userRow] = await db.select().from(users).where(eq(users.id, userId));
    const isAdmin = !!userRow?.isAdmin;
    const orgId = userRow?.orgId as string | undefined;
    if (!orgId) {
        return { orgId: undefined, allowedStoreIds: [], isAdmin };
    }
    if (isAdmin) {
        const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId));
        return { orgId, allowedStoreIds: storeRows.map(s => s.id), isAdmin };
    }
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const scoped = roles.map(r => r.storeId).filter(Boolean) as string[];
    if (!scoped.length) {
        const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId));
        return { orgId, allowedStoreIds: storeRows.map(s => s.id), isAdmin };
    }
    return { orgId, allowedStoreIds: scoped, isAdmin };
}

type SalesAggregateExpressions = {
    total: string;
    discount: string;
    tax: string;
};

let cachedSalesAggregates: SalesAggregateExpressions | null = null;

async function getSalesAggregateExpressions(): Promise<SalesAggregateExpressions> {
    if (cachedSalesAggregates) return cachedSalesAggregates;

    const columnResult = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
  `);

    const columnNames = new Set(
        ((columnResult as any).rows ?? []).map((row: any) => String(row.column_name).toLowerCase())
    );

    const buildAggregate = (candidates: string[]): string => {
        for (const candidate of candidates) {
            if (columnNames.has(candidate)) {
                return `COALESCE(SUM("${candidate}"::numeric), 0)`;
            }
        }
        return '0::numeric';
    };

    cachedSalesAggregates = {
        total: buildAggregate(['total', 'total_amount', 'gross_total']),
        discount: buildAggregate(['discount', 'discount_amount']),
        tax: buildAggregate(['tax', 'tax_amount'])
    };

    return cachedSalesAggregates;
}

export interface ComprehensiveReportData {
    period: {
        start: string;
        end: string;
    };
    currency: CurrencyCode;
    summary: {
        totalRevenue: Money;
        totalRefunds: Money;
        netRevenue: Money;
        totalDiscount: Money;
        totalTax: Money;
        transactionCount: number;
        refundCount: number;
        averageOrderValue: Money;
        cogs?: Money;
        profit?: Money;
        profitMargin?: number;
    };
    timeseries: Array<{
        date: string;
        revenue: number;
        discount: number;
        tax: number;
        transactions: number;
        refunds: number;
        refundCount: number;
        netRevenue: number;
    }>;
    topProducts: Array<{
        productId: string;
        name: string;
        sku: string | null;
        salesCount: number;
        revenue: Money;
    }>;
    storeName?: string;
}

export async function registerComprehensiveReportRoutes(app: Express) {
    const auth = (req: Request, res: Response, next: any) => {
        if (process.env.NODE_ENV === 'test') return next();
        return (requireAuth as any)(req, res, next);
    };

    /**
     * GET /api/analytics/export-comprehensive
     * 
     * Returns comprehensive report data including:
     * - Summary metrics (revenue, refunds, COGS, profit, etc.)
     * - Daily timeseries data for chart visualization
     * - Top 10 performing products
     */
    app.get('/api/analytics/export-comprehensive', auth, requireActiveSubscription, async (req: Request, res: Response) => {
        try {
            const { orgId, allowedStoreIds } = await getScope(req);
            const storeId = (String((req.query as any)?.store_id || '').trim() || undefined) as string | undefined;
            const dateFrom = (String((req.query as any)?.date_from || '').trim() || undefined) as string | undefined;
            const dateTo = (String((req.query as any)?.date_to || '').trim() || undefined) as string | undefined;
            const interval = (String((req.query as any)?.interval || '').trim() || 'day');

            // Validate store access
            if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId)) {
                return res.status(403).json({ error: 'Forbidden: store scope' });
            }

            // Get store details
            if (!storeId) {
                return res.status(400).json({ error: 'store_id is required' });
            }

            const [store] = await db.select({
                id: stores.id,
                orgId: stores.orgId,
                currency: stores.currency,
                name: stores.name
            }).from(stores).where(eq(stores.id, storeId)).limit(1);

            if (!store) {
                return res.status(404).json({ error: 'Store not found' });
            }

            const storeCurrency = coerceCurrency(store.currency ?? 'NGN', 'NGN');
            // Parse dates
            const endDate = dateTo ? new Date(dateTo) : new Date();
            const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

            if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                return res.status(400).json({ error: 'Invalid date range supplied' });
            }

            const truncUnit = interval === 'month' ? 'month' : interval === 'week' ? 'week' : 'day';

            // 1. Get sales aggregates (timeseries)
            const where: any[] = [];
            if (orgId) where.push(eq(sales.orgId, orgId));
            where.push(eq(sales.storeId, storeId));
            where.push(gte(sales.occurredAt, startDate));
            where.push(lte(sales.occurredAt, endDate));

            const salesAggregates = await getSalesAggregateExpressions();
            const salesRows = await db.execute(sql`SELECT 
        date_trunc(${sql.raw(`'${truncUnit}'`)}, occurred_at) as bucket,
        ${sql.raw(salesAggregates.total)} as revenue,
        ${sql.raw(salesAggregates.discount)} as discount,
        ${sql.raw(salesAggregates.tax)} as tax,
        COUNT(*) as transactions
        FROM sales
        ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
        GROUP BY 1
        ORDER BY 1 ASC`);

            // 2. Get refund aggregates
            const refundWhere: any[] = [];
            if (orgId) refundWhere.push(eq(stores.orgId, orgId));
            refundWhere.push(eq(returns.storeId, storeId));
            refundWhere.push(gte(returns.occurredAt, startDate));
            refundWhere.push(lte(returns.occurredAt, endDate));

            const refundRows = await db.execute(sql`
        SELECT 
          date_trunc(${sql.raw(`'${truncUnit}'`)}, ${returns.occurredAt}) as bucket,
          COALESCE(SUM(${returns.totalRefund}::numeric), 0) as refund_total,
          COUNT(*) as refund_count
        FROM ${returns}
        JOIN stores ON stores.id = ${returns.storeId}
        ${refundWhere.length ? sql`WHERE ${sql.join(refundWhere, sql` AND `)}` : sql``}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

            // Build refund map
            const refundMap = new Map<string, { total: number; count: number }>();
            for (const r of (refundRows as any).rows) {
                const key = new Date(r.bucket).toISOString();
                refundMap.set(key, {
                    total: Number(r.refund_total ?? 0),
                    count: Number(r.refund_count ?? 0),
                });
            }

            // Build timeseries
            const timeseries: ComprehensiveReportData['timeseries'] = [];
            let totalRevenue = 0;
            let totalDiscount = 0;
            let totalTax = 0;
            let totalTransactions = 0;
            let totalRefunds = 0;
            let totalRefundCount = 0;

            for (const r of (salesRows as any).rows) {
                const bucketDate = new Date(r.bucket);
                const key = bucketDate.toISOString();
                const refund = refundMap.get(key);
                const refundTotal = refund?.total ?? 0;
                const refundCount = refund?.count ?? 0;
                const revenue = Number(r.revenue ?? 0);
                const discount = Number(r.discount ?? 0);
                const tax = Number(r.tax ?? 0);
                const transactions = Number(r.transactions ?? 0);
                const netRevenue = revenue - refundTotal;

                totalRevenue += revenue;
                totalDiscount += discount;
                totalTax += tax;
                totalTransactions += transactions;
                totalRefunds += refundTotal;
                totalRefundCount += refundCount;

                timeseries.push({
                    date: key,
                    revenue,
                    discount,
                    tax,
                    transactions,
                    refunds: refundTotal,
                    refundCount,
                    netRevenue,
                });
            }

            // 3. Get profit/loss data
            let cogs: Money | undefined;
            let profit: Money | undefined;
            let profitMargin: number | undefined;

            try {
                const profitLoss = await storage.getStoreProfitLoss(storeId, startDate, endDate);
                cogs = toMoney(profitLoss.cogsFromSales, storeCurrency);
                profit = toMoney(profitLoss.profit, storeCurrency);
                const netRev = totalRevenue - totalRefunds;
                profitMargin = netRev > 0 ? (profitLoss.profit / netRev) * 100 : 0;
            } catch (err) {
                logger.warn('Failed to get profit/loss data for comprehensive report', { error: err });
            }

            // 4. Get top products
            const topProducts: ComprehensiveReportData['topProducts'] = [];
            try {
                const popularProducts = await storage.getPopularProducts(storeId, 10);
                for (const item of popularProducts) {
                    const priceAmount = Number(item.product?.price ?? item.product?.salePrice ?? 0);
                    topProducts.push({
                        productId: item.product.id,
                        name: item.product.name,
                        sku: item.product.sku,
                        salesCount: item.salesCount,
                        revenue: toMoney(priceAmount * item.salesCount, storeCurrency),
                    });
                }
            } catch (err) {
                logger.warn('Failed to get popular products for comprehensive report', { error: err });
            }

            // Build response
            const netRevenue = totalRevenue - totalRefunds;
            const averageOrderValue = totalTransactions > 0
                ? toMoney(totalRevenue / totalTransactions, storeCurrency)
                : toMoney(0, storeCurrency);

            const reportData: ComprehensiveReportData = {
                period: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                },
                currency: storeCurrency,
                summary: {
                    totalRevenue: toMoney(totalRevenue, storeCurrency),
                    totalRefunds: toMoney(totalRefunds, storeCurrency),
                    netRevenue: toMoney(netRevenue, storeCurrency),
                    totalDiscount: toMoney(totalDiscount, storeCurrency),
                    totalTax: toMoney(totalTax, storeCurrency),
                    transactionCount: totalTransactions,
                    refundCount: totalRefundCount,
                    averageOrderValue,
                    cogs,
                    profit,
                    profitMargin: profitMargin !== undefined ? roundAmount(profitMargin) : undefined,
                },
                timeseries,
                topProducts,
                storeName: store.name,
            };

            res.json(reportData);
        } catch (error) {
            logger.error('Failed to generate comprehensive report', {
                error: error instanceof Error ? error.message : String(error),
            });
            res.status(500).json({ error: 'Failed to generate comprehensive report' });
        }
    });
}
