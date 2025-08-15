import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { sales, saleItems, inventory, products, returns, stores } from '@shared/prd-schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { incrementTodayRollups } from '../lib/redis';

const SaleSchema = z.object({
  orgId: z.string().uuid(),
  storeId: z.string().uuid(),
  cashierId: z.string().uuid(),
  subtotal: z.string(),
  discount: z.string().default('0'),
  tax: z.string().default('0'),
  total: z.string(),
  paymentMethod: z.string().default('manual'),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.string(),
    lineDiscount: z.string().default('0'),
    lineTotal: z.string(),
  })),
});

export async function registerPosRoutes(app: Express) {
  app.post('/api/pos/sales', requireAuth, requireRole('CASHIER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const idempotencyKey = String(req.headers['idempotency-key'] || '');
    if (!idempotencyKey) return res.status(400).json({ error: 'Idempotency-Key required' });
    const parsed = SaleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    // Check idempotency
    const existing = await db.select().from(sales).where(eq(sales.idempotencyKey, idempotencyKey));
    if (existing[0]) return res.json(existing[0]);

    // Transactional insert and inventory decrement
    const client = (db as any).client;
    const pg = await client.connect();
    try {
      await pg.query('BEGIN');
      const [sale] = await db.insert(sales).values({
        ...parsed.data,
        idempotencyKey,
      } as any).returning();

      for (const item of parsed.data.items) {
        await db.insert(saleItems).values({
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineDiscount: item.lineDiscount,
          lineTotal: item.lineTotal,
        } as any);

        await db.execute(sql`UPDATE inventory SET quantity = quantity - ${item.quantity} WHERE store_id = ${parsed.data.storeId} AND product_id = ${item.productId}`);
      }

      await pg.query('COMMIT');

      // Redis rollups and websocket event (fire-and-forget)
      try {
        // Resolve orgId from store for channeling by org
        const srow = await db.select({ orgId: stores.orgId }).from(stores).where(eq(stores.id, parsed.data.storeId)).limit(1);
        const orgId = (srow as any)[0]?.orgId as string | undefined;
        const revenue = parseFloat(String(parsed.data.total || '0')) || 0;
        const discount = parseFloat(String(parsed.data.discount || '0')) || 0;
        const tax = parseFloat(String(parsed.data.tax || '0')) || 0;
        await incrementTodayRollups(orgId || parsed.data.orgId, parsed.data.storeId, {
          revenue,
          transactions: 1,
          discount,
          tax,
        });

        const wsService = (req.app as any).wsService;
        if (wsService) {
          const payload = {
            event: 'sale:created',
            orgId: orgId || parsed.data.orgId,
            storeId: parsed.data.storeId,
            delta: { revenue, transactions: 1, discount, tax },
            saleId: sale.id,
            occurredAt: new Date().toISOString(),
          };
          // Publish to store and org channels if supported by service
          if (wsService.publish) {
            await wsService.publish(`store:${parsed.data.storeId}`, payload);
            if (orgId || parsed.data.orgId) {
              await wsService.publish(`org:${orgId || parsed.data.orgId}`, payload);
            }
          } else if (wsService.broadcastNotification) {
            await wsService.broadcastNotification({
              type: 'sales_update',
              storeId: parsed.data.storeId,
              title: 'Sale created',
              message: `+${revenue.toFixed(2)}`,
              data: payload,
              priority: 'low',
            });
          }
        }
      } catch {}

      res.json(sale);
    } catch (e) {
      await pg.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to record sale' });
    } finally {
      pg.release();
    }
  });

  // POS Returns: restore inventory based on original sale items
  const ReturnSchema = z.object({
    saleId: z.string().uuid(),
    reason: z.string().optional(),
    storeId: z.string().uuid(),
  });

  app.post('/api/pos/returns', requireAuth, requireRole('CASHIER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ReturnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    // Verify sale exists and not already returned
    const saleRows = await db.select().from(sales).where(eq(sales.id, parsed.data.saleId));
    const sale = saleRows[0];
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status === 'RETURNED') return res.status(409).json({ error: 'Sale already returned' });

    const client = (db as any).client;
    const pg = await client.connect();
    try {
      await pg.query('BEGIN');

      // Mark sale as returned
      await db.execute(sql`UPDATE sales SET status = 'RETURNED' WHERE id = ${parsed.data.saleId}`);

      // Fetch sale items
      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, parsed.data.saleId));

      // Restore inventory per item
      for (const item of items) {
        await db.execute(sql`UPDATE inventory SET quantity = quantity + ${item.quantity} WHERE store_id = ${parsed.data.storeId} AND product_id = ${item.productId}`);
      }

      // Record return entry
      const [ret] = await db.insert(returns).values({
        saleId: parsed.data.saleId,
        reason: parsed.data.reason,
        processedBy: (req.session as any).userId,
      } as any).returning();

      await pg.query('COMMIT');
      res.status(201).json({ ok: true, return: ret });
    } catch (e) {
      await pg.query('ROLLBACK');
      res.status(500).json({ error: 'Failed to process return' });
    } finally {
      pg.release();
    }
  });
}


