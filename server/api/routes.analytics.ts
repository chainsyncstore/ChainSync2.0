import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { sales, saleItems, products } from '@shared/prd-schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export async function registerAnalyticsRoutes(app: Express) {
  app.get('/api/analytics/overview', async (req: Request, res: Response) => {
    const storeId = req.query.store_id as string | undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;

    const where: any[] = [];
    if (storeId) where.push(eq(sales.storeId, storeId));
    if (dateFrom) where.push(gte(sales.occurredAt, new Date(dateFrom)));
    if (dateTo) where.push(lte(sales.occurredAt, new Date(dateTo)));

    const total = await db.execute(sql`SELECT 
      COALESCE(SUM(total::numeric),0) as total, 
      COALESCE(SUM(discount::numeric),0) as discount, 
      COALESCE(SUM(tax::numeric),0) as tax
      FROM sales ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}`);

    res.json({
      gross: total.rows[0]?.total || '0',
      discount: total.rows[0]?.discount || '0',
      tax: total.rows[0]?.tax || '0',
    });
  });
}


