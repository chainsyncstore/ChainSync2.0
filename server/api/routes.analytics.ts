import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { sales, saleItems, products, auditLogs, users } from '@shared/prd-schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/authz';

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

  // Minimal admin audit logs feed
  app.get('/api/admin/audit', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const rows = await db.execute(sql`SELECT id, org_id, user_id, action, entity, entity_id, meta, ip, user_agent, created_at
      FROM audit_logs ORDER BY created_at DESC LIMIT ${limit}`);
    const logs = (rows as any).rows.map((r: any) => ({
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      meta: r.meta,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    }));
    res.json({ logs });
  });
}


