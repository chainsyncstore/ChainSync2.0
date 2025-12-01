/**
 * Profit reconciliation report
 * ----------------------------
 * Compares "legacy" COGS (product.cost snapshots) vs. the new cost-layer-based
 * calculations for each store over a date window, including deltas.
 *
 * Usage:
 *   ts-node scripts/profit-reconciliation-report.ts \
 *     [--start-date=2024-01-01] [--end-date=2024-02-01] [--org-id=...] [--store-id=...]
 *   # defaults to last 30 days when dates are omitted.
 *
 * Safety & validation:
 *   • Read-only script; no mutations are performed.
 *   • Filters by date range, org, or store to keep workloads manageable.
 *   • Aggregates per store and prints table summaries plus totals.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';

import { db, pool } from '../server/db';
import { storage } from '../server/storage';
import { stores, transactions, products } from '../shared/schema';

const DEFAULT_DAYS = 30;

type ReconciliationRow = {
  storeId: string;
  storeName: string;
  revenue: number;
  refundAmount: number;
  refundCount: number;
  cogsNew: number;
  cogsLegacy: number;
  inventoryAdjustments: number;
  profitNew: number;
  profitLegacy: number;
  profitDelta: number;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (value === undefined) {
      options[key] = 'true';
    } else {
      options[key] = value;
    }
  }
  return options;
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchStoresForRange(startDate: Date, endDate: Date, storeId?: string, orgId?: string) {
  const filters = [
    sql`tr.status = 'completed'`,
    sql`tr.created_at >= ${startDate}`,
    sql`tr.created_at < ${endDate}`,
  ];

  if (storeId) filters.push(sql`tr.store_id = ${storeId}`);
  if (orgId) filters.push(sql`st.org_id = ${orgId}`);

  const whereClause = sql.join(filters, sql` AND `);

  const { rows } = await db.execute(sql`
    SELECT DISTINCT tr.store_id AS store_id, st.name
    FROM ${transactions} tr
    JOIN ${stores} st ON st.id = tr.store_id
    WHERE ${whereClause}
    ORDER BY st.name ASC
  `);

  return rows as Array<{ store_id: string; name: string | null }>;
}

async function fetchLegacyCogs(storeId: string, startDate: Date, endDate: Date): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT COALESCE(SUM(ti.quantity * COALESCE(prod.cost, 0)), 0)::numeric AS legacy_cogs
    FROM ${transactions} tr
    JOIN transaction_items ti ON ti.transaction_id = tr.id
    LEFT JOIN ${products} prod ON prod.id = ti.product_id
    WHERE tr.store_id = ${storeId}
      AND tr.status = 'completed'
      AND tr.kind = 'SALE'
      AND tr.created_at >= ${startDate}
      AND tr.created_at < ${endDate}
  `);
  const [row] = rows as Array<{ legacy_cogs: string | number | null }>;
  return row?.legacy_cogs ? Number(row.legacy_cogs) : 0;
}

async function reconcile(storeId: string, storeName: string | null, startDate: Date, endDate: Date): Promise<ReconciliationRow> {
  const profitLoss = await storage.getStoreProfitLoss(storeId, startDate, endDate);
  const legacyCogs = await fetchLegacyCogs(storeId, startDate, endDate);

  const netRevenue = profitLoss.revenue - profitLoss.refundAmount;
  const legacyProfit = netRevenue - legacyCogs;

  return {
    storeId,
    storeName: storeName ?? 'Unnamed Store',
    revenue: profitLoss.revenue,
    refundAmount: profitLoss.refundAmount,
    refundCount: profitLoss.refundCount,
    cogsNew: profitLoss.netCost,
    cogsLegacy: legacyCogs,
    inventoryAdjustments: profitLoss.inventoryAdjustments,
    profitNew: profitLoss.profit,
    profitLegacy: legacyProfit,
    profitDelta: profitLoss.profit - legacyProfit,
  };
}

async function main() {
  const args = parseArgs();
  const today = new Date();
  const endDate = parseDate(args['end-date'], today);
  const startFallback = new Date(endDate);
  startFallback.setDate(startFallback.getDate() - DEFAULT_DAYS);
  const startDate = parseDate(args['start-date'], startFallback);

  if (startDate >= endDate) {
    throw new Error('start-date must be before end-date');
  }

  const storeId = args['store-id'];
  const orgId = args['org-id'];

  console.log('📊 Profit reconciliation');
  console.log(` • Window: ${startDate.toISOString()} → ${endDate.toISOString()} (exclusive)`);
  if (orgId) console.log(` • Org ID filter: ${orgId}`);
  if (storeId) console.log(` • Store ID filter: ${storeId}`);

  const storeRows = await fetchStoresForRange(startDate, endDate, storeId, orgId);
  if (storeRows.length === 0) {
    console.log('No completed transactions found for the given window/filters.');
    return;
  }

  const results: ReconciliationRow[] = [];
  for (const row of storeRows) {
    const summary = await reconcile(row.store_id, row.name, startDate, endDate);
    results.push(summary);
  }

  console.log('\nStore reconciliations:');
  console.table(results.map((row) => ({
    Store: row.storeName,
    Revenue: formatMoney(row.revenue),
    Refunds: formatMoney(row.refundAmount),
    'COGS (new)': formatMoney(row.cogsNew),
    'COGS (legacy)': formatMoney(row.cogsLegacy),
    'Inventory adj.': formatMoney(row.inventoryAdjustments),
    'Profit (new)': formatMoney(row.profitNew),
    'Profit (legacy)': formatMoney(row.profitLegacy),
    'Δ Profit': formatMoney(row.profitDelta),
  })));

  const totals = results.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.refunds += row.refundAmount;
      acc.cogsNew += row.cogsNew;
      acc.cogsLegacy += row.cogsLegacy;
      acc.profitNew += row.profitNew;
      acc.profitLegacy += row.profitLegacy;
      acc.inventoryAdjustments += row.inventoryAdjustments;
      return acc;
    },
    { revenue: 0, refunds: 0, cogsNew: 0, cogsLegacy: 0, profitNew: 0, profitLegacy: 0, inventoryAdjustments: 0 }
  );

  console.log('\nTotals across processed stores:');
  console.table([{
    Revenue: formatMoney(totals.revenue),
    Refunds: formatMoney(totals.refunds),
    'COGS (new)': formatMoney(totals.cogsNew),
    'COGS (legacy)': formatMoney(totals.cogsLegacy),
    'Inventory adj.': formatMoney(totals.inventoryAdjustments),
    'Profit (new)': formatMoney(totals.profitNew),
    'Profit (legacy)': formatMoney(totals.profitLegacy),
    'Δ Profit': formatMoney(totals.profitNew - totals.profitLegacy),
  }]);
}

main()
  .catch((error) => {
    console.error('❌ Reconciliation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
