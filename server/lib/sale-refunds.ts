import { and, eq, sql } from "drizzle-orm";
import { legacyReturns as returns, legacySales as sales, stores } from "@shared/schema";

import { db } from "../db";

export interface SaleRefundSummary {
  saleId: string;
  orgId: string;
  storeId: string;
  occurredAt: Date;
  currency: string;
  grossTotal: number;
  refundTotal: number;
  refundCount: number;
  netTotal: number;
}

/**
 * Returns a consolidated view of a sale and all associated refunds.
 * This is intended as a reusable building block for analytics and reporting.
 */
export async function getSaleRefundSummary(saleId: string): Promise<SaleRefundSummary | null> {
  const rows = await db
    .select({
      saleId: sales.id,
      orgId: sales.orgId,
      storeId: sales.storeId,
      occurredAt: sales.occurredAt,
      currency: stores.currency,
      grossTotal: sales.total,
      refundTotal: sql`COALESCE(SUM(${returns.totalRefund}::numeric), 0)`,
      refundCount: sql`COUNT(${returns.id})`,
    })
    .from(sales)
    .leftJoin(returns, and(eq(returns.saleId, sales.id), eq(returns.storeId, sales.storeId)))
    .innerJoin(stores, eq(stores.id, sales.storeId))
    .where(eq(sales.id, saleId))
    .groupBy(
      sales.id,
      sales.orgId,
      sales.storeId,
      sales.occurredAt,
      sales.total,
      stores.currency,
    );

  const row = rows[0];
  if (!row) return null;

  const gross = Number(row.grossTotal ?? 0);
  const refundTotal = Number((row as any).refundTotal ?? 0);
  const refundCount = Number((row as any).refundCount ?? 0);

  return {
    saleId: row.saleId,
    orgId: row.orgId,
    storeId: row.storeId,
    occurredAt: row.occurredAt,
    currency: row.currency ?? "USD",
    grossTotal: gross,
    refundTotal,
    refundCount,
    netTotal: gross - refundTotal,
  };
}
