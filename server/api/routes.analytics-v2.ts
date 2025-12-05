/**
 * Analytics API v2 - Complete rebuild with prescribed metrics
 */

import { and, eq, gte, lt, sql, inArray, desc, isNull, not } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import type { CurrencyCode, Money } from '@shared/lib/currency';
import {
  users,
  userRoles,
  stores,
  transactions,
  transactionItems,
  products,
  inventory,
  priceChangeEvents,
  inventoryRevaluationEvents,
  customers,
} from '@shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth } from '../middleware/authz';
import { requireActiveSubscription } from '../middleware/subscription';

const roundAmount = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const toMoney = (amount: number, currency: CurrencyCode): Money => ({ amount: roundAmount(amount), currency });

// Helper to convert JS array to PostgreSQL array for use with ANY()
function pgArray(arr: string[]) {
  if (!arr.length) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(arr.map(id => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
}

async function getScope(req: Request) {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) return { orgId: null, allowedStoreIds: [] as string[], isAdmin: false };

  const [userRow] = await db.select().from(users).where(eq(users.id, userId));
  const isAdmin = !!userRow?.isAdmin;
  const orgId = userRow?.orgId as string | null;

  if (!orgId) return { orgId: null, allowedStoreIds: [] as string[], isAdmin };

  if (isAdmin) {
    const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId));
    return { orgId, allowedStoreIds: storeRows.map(s => s.id), isAdmin };
  }

  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  const scoped = roles.map(r => r.storeId).filter(Boolean) as string[];
  const storeRows = scoped.length === 0
    ? await db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId))
    : await db.select({ id: stores.id }).from(stores).where(and(eq(stores.orgId, orgId), inArray(stores.id, scoped)));

  return { orgId, allowedStoreIds: storeRows.map(s => s.id), isAdmin };
}

async function getStoreCurrency(storeId: string): Promise<CurrencyCode> {
  const [store] = await db.select({ currency: stores.currency }).from(stores).where(eq(stores.id, storeId)).limit(1);
  return (store?.currency as CurrencyCode) || 'NGN';
}

function getDateWindow(req: Request) {
  const dateFrom = req.query.date_from ? new Date(req.query.date_from as string) : null;
  const dateTo = req.query.date_to ? new Date(req.query.date_to as string) : null;
  const end = dateTo && !isNaN(dateTo.getTime()) ? dateTo : new Date();
  const start = dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function getPreviousWindow(w: { start: Date; end: Date }) {
  const duration = w.end.getTime() - w.start.getTime();
  return { start: new Date(w.start.getTime() - duration), end: new Date(w.start.getTime() - 1) };
}

function deltaPercent(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return roundAmount(((curr - prev) / Math.abs(prev)) * 100);
}

export async function registerAnalyticsV2Routes(app: Express) {
  const auth = (req: Request, res: Response, next: any) => {
    if (process.env.NODE_ENV === 'test') return next();
    return (requireAuth as any)(req, res, next);
  };

  // OVERVIEW
  app.get('/api/analytics/v2/overview', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);
      const prevWindow = getPreviousWindow(window);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);
      const curr = await computeMetrics(targetStoreIds, window, currency);
      const prev = await computeMetrics(targetStoreIds, prevWindow, currency);
      const inv = await computeInventoryValue(targetStoreIds, currency);
      const custCurr = await computeCustomerMetrics(targetStoreIds, window);
      const custPrev = await computeCustomerMetrics(targetStoreIds, prevWindow);

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() },
        currency,
        revenue: { gross: curr.grossRevenue, net: curr.netRevenue, transactionCount: curr.transactionCount, delta: deltaPercent(curr.grossRevenue.amount, prev.grossRevenue.amount) },
        taxCollected: curr.taxCollected,
        refunds: { amount: curr.refundAmount, count: curr.refundCount, isNative: true },
        profit: { netProfit: curr.netProfit, marginPercent: curr.marginPercent, delta: deltaPercent(curr.netProfit.amount, prev.netProfit.amount) },
        inventory: { value: inv.value, itemCount: inv.itemCount },
        customers: { active: custCurr.active, newThisPeriod: custCurr.newThisPeriod, delta: deltaPercent(custCurr.active, custPrev.active) },
      });
    } catch (error) {
      logger.error('Analytics v2 overview error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // SALES
  app.get('/api/analytics/v2/sales', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);
      const prevWindow = getPreviousWindow(window);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);
      const curr = await computeMetrics(targetStoreIds, window, currency);
      const prev = await computeMetrics(targetStoreIds, prevWindow, currency);
      const custCount = await getUniqueCustomerCount(targetStoreIds, window);
      const prevCustCount = await getUniqueCustomerCount(targetStoreIds, prevWindow);
      const avgOrder = curr.transactionCount > 0 ? curr.grossRevenue.amount / curr.transactionCount : 0;
      const prevAvgOrder = prev.transactionCount > 0 ? prev.grossRevenue.amount / prev.transactionCount : 0;

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() },
        currency,
        totalRevenue: { value: curr.grossRevenue, delta: deltaPercent(curr.grossRevenue.amount, prev.grossRevenue.amount) },
        netRevenue: { value: curr.netRevenue, delta: deltaPercent(curr.netRevenue.amount, prev.netRevenue.amount) },
        transactions: { value: curr.transactionCount, delta: deltaPercent(curr.transactionCount, prev.transactionCount) },
        customers: { value: custCount, delta: deltaPercent(custCount, prevCustCount) },
        avgOrder: { value: toMoney(avgOrder, currency), delta: deltaPercent(avgOrder, prevAvgOrder) },
        refunds: { value: curr.refundAmount, count: curr.refundCount, delta: deltaPercent(curr.refundAmount.amount, prev.refundAmount.amount) },
      });
    } catch (error) {
      logger.error('Analytics v2 sales error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // TIMESERIES
  app.get('/api/analytics/v2/sales/timeseries', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const interval = (req.query.interval as string) || 'day';
      const window = getDateWindow(req);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);
      const truncUnit = interval === 'month' ? 'month' : interval === 'week' ? 'week' : 'day';

      const rows = await db.execute(sql`
        SELECT date_trunc(${sql.raw(`'${truncUnit}'`)}, created_at) as bucket,
          COALESCE(SUM(CASE WHEN kind = 'SALE' THEN total ELSE 0 END), 0) as revenue,
          COALESCE(SUM(CASE WHEN kind = 'REFUND' THEN total ELSE 0 END), 0) as refunds,
          COUNT(CASE WHEN kind = 'SALE' THEN 1 END) as txn_count
        FROM transactions WHERE store_id = ANY(${pgArray(targetStoreIds)}) AND status = 'completed'
          AND created_at >= ${window.start} AND created_at < ${window.end}
        GROUP BY 1 ORDER BY 1 ASC
      `);

      const points = ((rows as any).rows || []).map((r: any) => ({
        date: new Date(r.bucket).toISOString(),
        totalRevenue: toMoney(Number(r.revenue || 0), currency),
        netRevenue: toMoney(Number(r.revenue || 0) - Number(r.refunds || 0), currency),
        transactions: Number(r.txn_count || 0),
      }));

      res.json({ period: { start: window.start.toISOString(), end: window.end.toISOString() }, interval, currency, points });
    } catch (error) {
      logger.error('Analytics v2 timeseries error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Import remaining routes from separate module
  await registerAnalyticsV2RoutesExtended(app);
}

// Separate helper registration for remaining endpoints
async function registerAnalyticsV2RoutesExtended(app: Express) {
  const auth = (req: Request, res: Response, next: any) => {
    if (process.env.NODE_ENV === 'test') return next();
    return (requireAuth as any)(req, res, next);
  };

  // POPULAR PRODUCTS
  app.get('/api/analytics/v2/products/popular', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      const [totalRow] = await db.select({ total: sql<number>`COALESCE(SUM(${transactionItems.totalPrice}), 0)` })
        .from(transactionItems).innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .where(and(inArray(transactions.storeId, targetStoreIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

      const totalRevenue = Number(totalRow?.total || 0);

      const productRows = await db.select({
        productId: transactionItems.productId, productName: products.name, sku: products.sku,
        unitsSold: sql<number>`SUM(${transactionItems.quantity})`, revenue: sql<number>`SUM(${transactionItems.totalPrice})`,
      }).from(transactionItems).innerJoin(transactions, eq(transactionItems.transactionId, transactions.id)).innerJoin(products, eq(transactionItems.productId, products.id))
        .where(and(inArray(transactions.storeId, targetStoreIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)))
        .groupBy(transactionItems.productId, products.name, products.sku).orderBy(desc(sql`SUM(${transactionItems.totalPrice})`)).limit(limit);

      const items = productRows.map(r => ({
        productId: r.productId, name: r.productName, sku: r.sku, unitsSold: Number(r.unitsSold || 0),
        revenue: toMoney(Number(r.revenue || 0), currency),
        sharePercent: totalRevenue > 0 ? roundAmount((Number(r.revenue || 0) / totalRevenue) * 100) : 0,
      }));

      res.json({ period: { start: window.start.toISOString(), end: window.end.toISOString() }, currency, totalRevenue: toMoney(totalRevenue, currency), items });
    } catch (error) {
      logger.error('Analytics v2 popular products error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // PROFIT & LOSS
  app.get('/api/analytics/v2/profit-loss', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);
      const metrics = await computeMetrics(targetStoreIds, window, currency);

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() },
        currency,
        revenue: metrics.grossRevenue,
        taxCollected: metrics.taxCollected,
        refunds: metrics.refundAmount,
        netRevenue: metrics.netRevenue,
        cogs: metrics.cogs,
        inventoryAdjustments: metrics.inventoryAdjustments,
        netCost: toMoney(metrics.cogs.amount + metrics.inventoryAdjustments.amount, currency),
        stockRemovalLoss: metrics.stockRemovalLoss,
        manufacturerRefunds: metrics.manufacturerRefunds,
        netProfit: metrics.netProfit,
        marginPercent: metrics.marginPercent,
      });
    } catch (error) {
      logger.error('Analytics v2 profit-loss error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // INVENTORY
  app.get('/api/analytics/v2/inventory', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      const [totalRow] = await db.select({
        skuCount: sql<number>`COUNT(DISTINCT ${inventory.productId})`,
        totalValue: sql<number>`COALESCE(SUM(${inventory.quantity}::numeric * ${inventory.avgCost}::numeric), 0)`,
      }).from(inventory).where(inArray(inventory.storeId, targetStoreIds));

      const [lowRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(inventory)
        .where(and(inArray(inventory.storeId, targetStoreIds), sql`${inventory.quantity} <= ${inventory.minStockLevel}`, sql`${inventory.quantity} > 0`));

      const [outRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(inventory)
        .where(and(inArray(inventory.storeId, targetStoreIds), eq(inventory.quantity, 0)));

      const agingRows = await db.execute(sql`
        SELECT CASE WHEN last_restocked IS NULL THEN 'unknown' WHEN CURRENT_DATE - DATE(last_restocked) <= 30 THEN '0-30'
          WHEN CURRENT_DATE - DATE(last_restocked) <= 60 THEN '31-60' WHEN CURRENT_DATE - DATE(last_restocked) <= 90 THEN '61-90' ELSE '90+' END as bucket,
          COUNT(*) as sku_count, COALESCE(SUM(quantity::numeric * avg_cost::numeric), 0) as total_value
        FROM inventory WHERE store_id = ANY(${pgArray(targetStoreIds)}) GROUP BY 1
      `);

      const oldest = await db.select({ productId: inventory.productId, productName: products.name, quantity: inventory.quantity, avgCost: inventory.avgCost, lastRestocked: inventory.lastRestocked })
        .from(inventory).innerJoin(products, eq(inventory.productId, products.id))
        .where(and(inArray(inventory.storeId, targetStoreIds), not(isNull(inventory.lastRestocked))))
        .orderBy(inventory.lastRestocked).limit(5);

      const lowItems = await db.select({ productId: inventory.productId, productName: products.name, quantity: inventory.quantity, minStockLevel: inventory.minStockLevel })
        .from(inventory).innerJoin(products, eq(inventory.productId, products.id))
        .where(and(inArray(inventory.storeId, targetStoreIds), sql`${inventory.quantity} <= ${inventory.minStockLevel}`, sql`${inventory.quantity} > 0`))
        .orderBy(sql`${inventory.quantity}::numeric / NULLIF(${inventory.minStockLevel}::numeric, 0)`).limit(5);

      const outItems = await db.select({ productId: inventory.productId, productName: products.name, lastRestocked: inventory.lastRestocked })
        .from(inventory).innerJoin(products, eq(inventory.productId, products.id))
        .where(and(inArray(inventory.storeId, targetStoreIds), eq(inventory.quantity, 0))).limit(5);

      res.json({
        currency, totalSKUs: Number(totalRow?.skuCount || 0), inventoryValue: toMoney(Number(totalRow?.totalValue || 0), currency),
        lowStockCount: Number(lowRow?.count || 0), outOfStockCount: Number(outRow?.count || 0),
        aging: ((agingRows as any).rows || []).map((r: any) => ({ bucket: r.bucket, skuCount: Number(r.sku_count || 0), value: toMoney(Number(r.total_value || 0), currency) })),
        oldestInventory: oldest.map(i => ({ productId: i.productId, name: i.productName, quantity: i.quantity, value: toMoney(Number(i.quantity || 0) * Number(i.avgCost || 0), currency), daysSinceRestock: i.lastRestocked ? Math.floor((Date.now() - new Date(i.lastRestocked).getTime()) / 86400000) : null })),
        watchlist: {
          lowStock: lowItems.map(i => ({ productId: i.productId, name: i.productName, quantity: i.quantity, minLevel: i.minStockLevel, percentToTarget: i.minStockLevel ? roundAmount((Number(i.quantity) / Number(i.minStockLevel)) * 100) : 0 })),
          outOfStock: outItems.map(i => ({ productId: i.productId, name: i.productName, lastRestocked: i.lastRestocked?.toISOString() || null })),
        },
      });
    } catch (error) {
      logger.error('Analytics v2 inventory error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });
}

// Helper functions
async function computeMetrics(storeIds: string[], window: { start: Date; end: Date }, currency: CurrencyCode) {
  const [salesRow] = await db.select({
    revenue: sql`COALESCE(SUM(${transactions.total}), 0)`,
    taxCollected: sql`COALESCE(SUM(${transactions.taxAmount}), 0)`,
    transactionCount: sql`COUNT(*)`,
  }).from(transactions).where(and(inArray(transactions.storeId, storeIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

  const [cogsRow] = await db.select({ cogs: sql`COALESCE(SUM(${transactionItems.totalCost}), 0)` })
    .from(transactionItems).innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(and(inArray(transactions.storeId, storeIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

  const [refundRow] = await db.select({ amount: sql`COALESCE(SUM(${transactions.total}), 0)`, count: sql`COUNT(*)` })
    .from(transactions).where(and(inArray(transactions.storeId, storeIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'REFUND'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

  const [adjRow] = await db.select({ delta: sql`COALESCE(SUM(${inventoryRevaluationEvents.deltaValue}), 0)` })
    .from(inventoryRevaluationEvents).where(and(inArray(inventoryRevaluationEvents.storeId, storeIds), gte(inventoryRevaluationEvents.occurredAt, window.start), lt(inventoryRevaluationEvents.occurredAt, window.end), sql`${inventoryRevaluationEvents.source} NOT LIKE 'stock_removal_%'`));

  const stockRemovalEvents = await db.select({ metadata: inventoryRevaluationEvents.metadata })
    .from(inventoryRevaluationEvents).where(and(inArray(inventoryRevaluationEvents.storeId, storeIds), gte(inventoryRevaluationEvents.occurredAt, window.start), lt(inventoryRevaluationEvents.occurredAt, window.end), sql`${inventoryRevaluationEvents.source} LIKE 'stock_removal_%'`));

  let stockRemovalLoss = 0, manufacturerRefunds = 0;
  for (const e of stockRemovalEvents) {
    const m = e.metadata as Record<string, any> | null;
    if (m) { stockRemovalLoss += Number(m.lossAmount || 0); manufacturerRefunds += Number(m.refundAmount || 0); }
  }

  const grossRevenue = Number(salesRow?.revenue || 0);
  const taxCollected = Number(salesRow?.taxCollected || 0);
  const transactionCount = Number(salesRow?.transactionCount || 0);
  const cogs = Number(cogsRow?.cogs || 0);
  const refundAmount = Number(refundRow?.amount || 0);
  const refundCount = Number(refundRow?.count || 0);
  const inventoryAdjustments = Number(adjRow?.delta || 0);
  // Net revenue excludes tax (tax is pass-through, not income)
  const revenueExcludingTax = grossRevenue - taxCollected;
  const netRevenue = revenueExcludingTax - refundAmount;
  const netCost = cogs + inventoryAdjustments;
  const netProfit = netRevenue - netCost - stockRemovalLoss + manufacturerRefunds;
  const marginPercent = revenueExcludingTax > 0 ? roundAmount((netProfit / revenueExcludingTax) * 100) : 0;

  return {
    grossRevenue: toMoney(grossRevenue, currency), netRevenue: toMoney(netRevenue, currency), transactionCount,
    taxCollected: toMoney(taxCollected, currency),
    refundAmount: toMoney(refundAmount, currency), refundCount, cogs: toMoney(cogs, currency),
    inventoryAdjustments: toMoney(inventoryAdjustments, currency), stockRemovalLoss: toMoney(stockRemovalLoss, currency),
    manufacturerRefunds: toMoney(manufacturerRefunds, currency), netProfit: toMoney(netProfit, currency), marginPercent,
  };
}

async function computeInventoryValue(storeIds: string[], currency: CurrencyCode) {
  const [row] = await db.select({
    totalValue: sql<number>`COALESCE(SUM(${inventory.quantity}::numeric * ${inventory.avgCost}::numeric), 0)`,
    itemCount: sql<number>`COUNT(DISTINCT ${inventory.productId})`,
  }).from(inventory).where(inArray(inventory.storeId, storeIds));
  return { value: toMoney(Number(row?.totalValue || 0), currency), itemCount: Number(row?.itemCount || 0) };
}

async function computeCustomerMetrics(storeIds: string[], window: { start: Date; end: Date }) {
  // Count all customers from customers table (loyalty customers onboarded)
  const [totalRow] = await db.select({
    total: sql<number>`COUNT(*)`,
    newThisPeriod: sql<number>`COUNT(CASE WHEN ${customers.createdAt} >= ${window.start} AND ${customers.createdAt} < ${window.end} THEN 1 END)`,
  }).from(customers).where(and(inArray(customers.storeId, storeIds), eq(customers.isActive, true)));
  
  // Count active customers (those who made transactions in the period)
  const activeResult = await db.execute(sql`
    SELECT COUNT(DISTINCT lt.customer_id) as active
    FROM loyalty_transactions lt 
    INNER JOIN transactions t ON lt.transaction_id = t.id 
    WHERE t.store_id = ANY(${pgArray(storeIds)}) AND t.status = 'completed' AND t.kind = 'SALE' 
      AND t.created_at >= ${window.start} AND t.created_at < ${window.end}
  `);
  const activeCount = Number(((activeResult as any).rows || [])[0]?.active || 0);
  
  return { 
    active: Number(totalRow?.total || 0),  // Total enrolled customers
    activeTransacting: activeCount,         // Customers who made purchases
    newThisPeriod: Number(totalRow?.newThisPeriod || 0), 
    retentionRate: 0 
  };
}

// eslint-disable-next-line no-unused-vars
async function getUniqueCustomerCount(storeIds: string[], _window: { start: Date; end: Date }) {
  // Count total enrolled customers in the store
  const [row] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(customers).where(and(inArray(customers.storeId, storeIds), eq(customers.isActive, true)));
  return Number(row?.count || 0);
}

// Additional endpoints registration
export async function registerAnalyticsV2RoutesExtra(app: Express) {
  const auth = (req: Request, res: Response, next: any) => {
    if (process.env.NODE_ENV === 'test') return next();
    return (requireAuth as any)(req, res, next);
  };

  // CUSTOMERS
  app.get('/api/analytics/v2/customers', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);
      const prevWindow = getPreviousWindow(window);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      // Total customers from customers table (all enrolled loyalty customers)
      const [customerCounts] = await db.select({
        total: sql<number>`COUNT(*)`,
        newThisPeriod: sql<number>`COUNT(CASE WHEN ${customers.createdAt} >= ${window.start} AND ${customers.createdAt} < ${window.end} THEN 1 END)`,
      }).from(customers).where(and(inArray(customers.storeId, targetStoreIds), eq(customers.isActive, true)));

      const totalCustomers = Number(customerCounts?.total || 0);
      const newCustomers = Number(customerCounts?.newThisPeriod || 0);

      // Customers who have made transactions (repeat = made transactions before the period AND during the period)
      const repeatResult = await db.execute(sql`
        SELECT COUNT(DISTINCT cp.customer_id) as repeat_count FROM (
          SELECT DISTINCT lt.customer_id FROM loyalty_transactions lt INNER JOIN transactions t ON lt.transaction_id = t.id
          WHERE t.store_id = ANY(${pgArray(targetStoreIds)}) AND t.status = 'completed' AND t.kind = 'SALE'
            AND t.created_at >= ${window.start} AND t.created_at < ${window.end}
        ) cp INNER JOIN (
          SELECT DISTINCT lt.customer_id FROM loyalty_transactions lt INNER JOIN transactions t ON lt.transaction_id = t.id
          WHERE t.store_id = ANY(${pgArray(targetStoreIds)}) AND t.status = 'completed' AND t.kind = 'SALE' AND t.created_at < ${window.start}
        ) pp ON cp.customer_id = pp.customer_id
      `);
      const repeatCustomers = Number(((repeatResult as any).rows || [])[0]?.repeat_count || 0);
      const retentionRate = totalCustomers > 0 ? roundAmount((repeatCustomers / totalCustomers) * 100) : 0;

      // Previous period metrics
      const [prevCounts] = await db.select({
        total: sql<number>`COUNT(*)`,
      }).from(customers).where(and(
        inArray(customers.storeId, targetStoreIds), 
        eq(customers.isActive, true),
        lt(customers.createdAt, prevWindow.end)
      ));
      const prevTotalCustomers = Number(prevCounts?.total || 0);

      // Engagement metrics
      const [transMetrics] = await db.select({
        totalTransactions: sql<number>`COUNT(DISTINCT ${transactions.id})`,
        totalRevenue: sql<number>`COALESCE(SUM(${transactions.total}), 0)`,
      }).from(transactions).where(and(inArray(transactions.storeId, targetStoreIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

      const totalTrans = Number(transMetrics?.totalTransactions || 0);
      const totalRev = Number(transMetrics?.totalRevenue || 0);
      const transactionsPerCustomer = totalCustomers > 0 ? roundAmount(totalTrans / totalCustomers) : 0;
      const avgOrderValue = totalTrans > 0 ? roundAmount(totalRev / totalTrans) : 0;
      const customerGrowth = prevTotalCustomers > 0 ? roundAmount(((totalCustomers - prevTotalCustomers) / prevTotalCustomers) * 100) : totalCustomers > 0 ? 100 : 0;
      const loyalCustomers = repeatCustomers; // Customers with multiple transactions
      const churnRisk = totalCustomers > 0 ? roundAmount((Math.max(0, totalCustomers - loyalCustomers - newCustomers) / totalCustomers) * 100) : 0;

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() }, currency,
        totalCustomers: { value: totalCustomers, delta: deltaPercent(totalCustomers, prevTotalCustomers) },
        newThisPeriod: { value: newCustomers, percent: totalCustomers > 0 ? roundAmount((newCustomers / totalCustomers) * 100) : 0 },
        loyalCustomers: { value: loyalCustomers, percent: totalCustomers > 0 ? roundAmount((loyalCustomers / totalCustomers) * 100) : 0 },
        retentionRate: { value: retentionRate, delta: null },
        segments: { new: newCustomers, repeat: loyalCustomers, newPercent: totalCustomers > 0 ? roundAmount((newCustomers / totalCustomers) * 100) : 0, repeatPercent: totalCustomers > 0 ? roundAmount((loyalCustomers / totalCustomers) * 100) : 0 },
        engagement: { transactionsPerCustomer, avgOrderValue: toMoney(avgOrderValue, currency), customerGrowth, churnRisk },
      });
    } catch (error) {
      logger.error('Analytics v2 customers error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // STAFF
  app.get('/api/analytics/v2/staff', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      // Staff on shift (active in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const activeStaffResult = await db.execute(sql`SELECT COUNT(DISTINCT cashier_id) as active_count FROM transactions WHERE store_id = ANY(${pgArray(targetStoreIds)}) AND created_at >= ${oneHourAgo}`);
      const staffOnShift = Number(((activeStaffResult as any).rows || [])[0]?.active_count || 0);

      // Leaderboard
      const leaderboardRows = await db.execute(sql`
        SELECT t.cashier_id, u.first_name, u.last_name, u.email, u.role, COUNT(DISTINCT t.id) as ticket_count,
          COALESCE(SUM(CASE WHEN t.kind = 'SALE' THEN t.total ELSE 0 END), 0) as total_revenue
        FROM transactions t LEFT JOIN users u ON t.cashier_id = u.id
        WHERE t.store_id = ANY(${pgArray(targetStoreIds)}) AND t.status = 'completed' AND t.created_at >= ${window.start} AND t.created_at < ${window.end}
        GROUP BY t.cashier_id, u.first_name, u.last_name, u.email, u.role ORDER BY total_revenue DESC
      `);

      const leaderboard = ((leaderboardRows as any).rows || []).map((r: any, i: number) => ({
        rank: i + 1, userId: r.cashier_id, name: r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : r.email || 'Unknown',
        role: r.role || 'cashier', revenue: toMoney(Number(r.total_revenue || 0), currency), tickets: Number(r.ticket_count || 0),
        avgTicket: toMoney(Number(r.ticket_count || 0) > 0 ? Number(r.total_revenue || 0) / Number(r.ticket_count) : 0, currency),
      }));

      const topPerformer = leaderboard.length > 0 ? leaderboard[0] : null;

      // Store contribution
      let storeContribution: any[] = [];
      if (targetStoreIds.length > 1) {
        const storeRows = await db.execute(sql`
          SELECT t.store_id, s.name as store_name, COUNT(DISTINCT t.id) as ticket_count, COUNT(DISTINCT t.cashier_id) as staff_count,
            COALESCE(SUM(CASE WHEN t.kind = 'SALE' THEN t.total ELSE 0 END), 0) as total_revenue
          FROM transactions t INNER JOIN stores s ON t.store_id = s.id
          WHERE t.store_id = ANY(${pgArray(targetStoreIds)}) AND t.status = 'completed' AND t.created_at >= ${window.start} AND t.created_at < ${window.end}
          GROUP BY t.store_id, s.name ORDER BY total_revenue DESC
        `);
        storeContribution = ((storeRows as any).rows || []).map((r: any) => ({
          storeId: r.store_id, storeName: r.store_name, revenue: toMoney(Number(r.total_revenue || 0), currency),
          tickets: Number(r.ticket_count || 0), staffCount: Number(r.staff_count || 0),
        }));
      }

      const activeStaff = leaderboard.length;
      const totalTransactions = leaderboard.reduce((s, x) => s + x.tickets, 0);
      const totalRevenue = leaderboard.reduce((s, x) => s + x.revenue.amount, 0);

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() }, currency, staffOnShift, topPerformer, leaderboard, storeContribution,
        operationalInsights: {
          avgTicketsPerStaff: activeStaff > 0 ? roundAmount(totalTransactions / activeStaff) : 0,
          revenuePerStaff: toMoney(activeStaff > 0 ? totalRevenue / activeStaff : 0, currency),
          activeStaffCount: activeStaff, totalTransactions, totalRevenue: toMoney(totalRevenue, currency),
        },
      });
    } catch (error) {
      logger.error('Analytics v2 staff error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // PRICE TRENDS LIST
  app.get('/api/analytics/v2/price-trends', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const window = getDateWindow(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      const productRows = await db.execute(sql`
        SELECT DISTINCT p.id as product_id, p.name as product_name, p.sku, p.price as current_price, p.cost as current_cost,
          (SELECT COUNT(*) FROM price_change_events pce WHERE pce.product_id = p.id AND pce.store_id = ANY(${pgArray(targetStoreIds)}) AND pce.occurred_at >= ${window.start} AND pce.occurred_at < ${window.end}) as price_change_count
        FROM products p WHERE EXISTS (SELECT 1 FROM price_change_events pce WHERE pce.product_id = p.id AND pce.store_id = ANY(${pgArray(targetStoreIds)}) AND pce.occurred_at >= ${window.start} AND pce.occurred_at < ${window.end})
          OR EXISTS (SELECT 1 FROM inventory_revaluation_events ire WHERE ire.product_id = p.id AND ire.store_id = ANY(${pgArray(targetStoreIds)}) AND ire.occurred_at >= ${window.start} AND ire.occurred_at < ${window.end})
        ORDER BY price_change_count DESC LIMIT ${limit}
      `);

      const items = ((productRows as any).rows || []).map((r: any) => ({
        productId: r.product_id, name: r.product_name, sku: r.sku,
        currentPrice: toMoney(Number(r.current_price || 0), currency),
        currentCost: toMoney(Number(r.current_cost || 0), currency),
        eventCount: Number(r.price_change_count || 0),
      }));

      res.json({ period: { start: window.start.toISOString(), end: window.end.toISOString() }, currency, items });
    } catch (error) {
      logger.error('Analytics v2 price trends list error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // PRICE TRENDS DETAIL
  app.get('/api/analytics/v2/price-trends/:productId', auth, requireActiveSubscription, async (req, res) => {
    try {
      const { allowedStoreIds } = await getScope(req);
      const storeId = req.query.store_id as string | undefined;
      const productId = req.params.productId;
      const window = getDateWindow(req);

      if (!productId) return res.status(400).json({ error: 'productId required' });
      if (storeId && allowedStoreIds.length && !allowedStoreIds.includes(storeId))
        return res.status(403).json({ error: 'Forbidden' });

      const targetStoreIds = storeId ? [storeId] : allowedStoreIds;
      if (!targetStoreIds.length) return res.status(400).json({ error: 'No stores' });

      const currency = await getStoreCurrency(targetStoreIds[0]);

      const [product] = await db.select({ id: products.id, name: products.name, sku: products.sku, price: products.price, cost: products.cost })
        .from(products).where(eq(products.id, productId)).limit(1);
      if (!product) return res.status(404).json({ error: 'Product not found' });

      const [priceChangeRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(priceChangeEvents)
        .where(and(inArray(priceChangeEvents.storeId, targetStoreIds), eq(priceChangeEvents.productId, productId), gte(priceChangeEvents.occurredAt, window.start), lt(priceChangeEvents.occurredAt, window.end)));

      const [cogsRow] = await db.select({ cogs: sql<number>`COALESCE(SUM(${transactionItems.totalCost}), 0)` })
        .from(transactionItems).innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .where(and(inArray(transactions.storeId, targetStoreIds), eq(transactions.status, 'completed'), eq(transactions.kind, 'SALE'), eq(transactionItems.productId, productId), gte(transactions.createdAt, window.start), lt(transactions.createdAt, window.end)));

      const [adjRow] = await db.select({ delta: sql<number>`COALESCE(SUM(${inventoryRevaluationEvents.deltaValue}), 0)` })
        .from(inventoryRevaluationEvents).where(and(inArray(inventoryRevaluationEvents.storeId, targetStoreIds), eq(inventoryRevaluationEvents.productId, productId), gte(inventoryRevaluationEvents.occurredAt, window.start), lt(inventoryRevaluationEvents.occurredAt, window.end)));

      const [invRow] = await db.select({ quantity: inventory.quantity, avgCost: inventory.avgCost })
        .from(inventory).where(and(inArray(inventory.storeId, targetStoreIds), eq(inventory.productId, productId))).limit(1);

      const priceEvents = await db.select({ occurredAt: priceChangeEvents.occurredAt, oldSalePrice: priceChangeEvents.oldSalePrice, newSalePrice: priceChangeEvents.newSalePrice, oldCost: priceChangeEvents.oldCost, newCost: priceChangeEvents.newCost, source: priceChangeEvents.source })
        .from(priceChangeEvents).where(and(inArray(priceChangeEvents.storeId, targetStoreIds), eq(priceChangeEvents.productId, productId), gte(priceChangeEvents.occurredAt, window.start), lt(priceChangeEvents.occurredAt, window.end))).orderBy(priceChangeEvents.occurredAt);

      const revalEvents = await db.select({ occurredAt: inventoryRevaluationEvents.occurredAt, avgCostBefore: inventoryRevaluationEvents.avgCostBefore, avgCostAfter: inventoryRevaluationEvents.avgCostAfter, deltaValue: inventoryRevaluationEvents.deltaValue, source: inventoryRevaluationEvents.source })
        .from(inventoryRevaluationEvents).where(and(inArray(inventoryRevaluationEvents.storeId, targetStoreIds), eq(inventoryRevaluationEvents.productId, productId), gte(inventoryRevaluationEvents.occurredAt, window.start), lt(inventoryRevaluationEvents.occurredAt, window.end))).orderBy(inventoryRevaluationEvents.occurredAt);

      const timeline = [...priceEvents.map(e => ({ date: e.occurredAt?.toISOString() || '', salePrice: e.newSalePrice ? Number(e.newSalePrice) : null, costPrice: e.newCost ? Number(e.newCost) : null, eventType: 'price_change' as const })),
        ...revalEvents.map(e => ({ date: e.occurredAt?.toISOString() || '', salePrice: null, costPrice: e.avgCostAfter ? Number(e.avgCostAfter) : null, eventType: 'revaluation' as const }))].sort((a, b) => a.date.localeCompare(b.date));

      const recentEvents = [...priceEvents.map(e => ({ type: 'Price Change' as const, occurredAt: e.occurredAt?.toISOString() || '', oldSalePrice: e.oldSalePrice ? Number(e.oldSalePrice) : null, newSalePrice: e.newSalePrice ? Number(e.newSalePrice) : null, oldCost: e.oldCost ? Number(e.oldCost) : null, newCost: e.newCost ? Number(e.newCost) : null, source: e.source })),
        ...revalEvents.map(e => ({ type: 'Inventory Revaluation' as const, occurredAt: e.occurredAt?.toISOString() || '', oldCost: e.avgCostBefore ? Number(e.avgCostBefore) : null, newCost: e.avgCostAfter ? Number(e.avgCostAfter) : null, adjustmentAmount: e.deltaValue ? Number(e.deltaValue) : null, source: e.source }))
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 10);

      const currentQuantity = Number(invRow?.quantity || 0);
      const currentAvgCost = Number(invRow?.avgCost || 0);

      res.json({
        period: { start: window.start.toISOString(), end: window.end.toISOString() }, currency,
        product: { id: product.id, name: product.name, sku: product.sku, currentSalePrice: toMoney(Number(product.price || 0), currency), currentCostPrice: toMoney(Number(product.cost || 0), currency) },
        summary: { priceChangeCount: Number(priceChangeRow?.count || 0), cogs: toMoney(Number(cogsRow?.cogs || 0), currency), inventoryAdjustments: toMoney(Number(adjRow?.delta || 0), currency), netCost: toMoney(Number(cogsRow?.cogs || 0) + Number(adjRow?.delta || 0), currency) },
        currentSnapshot: { quantity: currentQuantity, avgCost: toMoney(currentAvgCost, currency), totalValue: toMoney(currentQuantity * currentAvgCost, currency) },
        timeline, recentEvents,
      });
    } catch (error) {
      logger.error('Analytics v2 price trends error', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
