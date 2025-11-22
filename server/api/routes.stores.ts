import { and, eq, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { stores, users, subscriptions } from '@shared/schema';
import { db } from '../db';
import { getPlan } from '../lib/plans';
import { requireAuth, requireRole, enforceIpWhitelist } from '../middleware/authz';

const taxRateSchema = z.number().min(0).max(1);

const CreateStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  currency: z.enum(['NGN', 'USD']).optional().default('NGN'),
  taxRate: taxRateSchema.optional(),
});

const UpdateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxRate: taxRateSchema.optional(),
  isActive: z.boolean().optional(),
});

export async function registerStoreRoutes(app: Express) {
  // List stores for current user's org
  app.get('/api/stores', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });
    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) return res.json([]);
    const rows = await db.select().from(stores).where(eq(stores.orgId, me.orgId)).limit(200);
    res.json(rows);
  });

  // Create store for current user's org
  app.post('/api/stores', requireAuth, requireRole('ADMIN'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = CreateStoreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });
    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

    // Enforce subscription limits
    const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, me.orgId)))[0];
    const plan = getPlan(sub?.planCode || 'basic');
    const storeCountResult = await db.execute(sql`select count(*) from stores where org_id = ${me.orgId}`);
    const storeCount = parseInt((storeCountResult.rows[0] as any).count, 10);

    if (storeCount >= plan.maxStores) {
      return res.status(403).json({ error: 'Store limit reached. Upgrade to add more stores.' });
    }

    const taxRate = parsed.data.taxRate ?? 0.085;

    const [created] = await db.insert(stores).values({
      orgId: me.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      currency: parsed.data.currency,
      taxRate: Number.isFinite(taxRate) ? taxRate.toFixed(4) : '0.0850',
    } as any).returning();

    return res.status(201).json(created);
  });

  app.delete('/api/stores/:id', requireAuth, requireRole('ADMIN'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const storeId = req.params.id;
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) {
      return res.status(400).json({ error: 'Missing org' });
    }

    const [store] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.orgId, me.orgId)))
      .limit(1);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE store_id = ${storeId})`
      );
      await tx.execute(
        sql`DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE store_id = ${storeId})`
      );

      const tablesWithStoreId = [
        'inventory',
        'low_stock_alerts',
        'notifications',
        'websocket_connections',
        'sync_queue',
        'user_store_permissions',
        'loyalty_tiers',
        'customers',
        'forecast_models',
        'external_factors',
        'ai_insights',
        'seasonal_patterns',
        'demand_forecasts',
        'ip_whitelists',
        'price_changes',
        'sales',
        'transactions',
      ] as const;

      for (const tableName of tablesWithStoreId) {
        await tx.execute(sql`DELETE FROM ${sql.raw(tableName)} WHERE store_id = ${storeId}`);
      }

      await tx.execute(sql`DELETE FROM user_roles WHERE store_id = ${storeId}`);
      await tx.execute(sql`UPDATE users SET store_id = NULL WHERE store_id = ${storeId}`);

      await tx.delete(stores).where(and(eq(stores.id, storeId), eq(stores.orgId, me.orgId)));
    });

    res.status(204).send();
  });

  // Update a store
  app.patch('/api/stores/:id', requireAuth, requireRole('ADMIN'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = UpdateStoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const storeId = req.params.id;
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

    const [store] = await db.select().from(stores).where(eq(stores.id, storeId));
    if (!store || store.orgId !== me.orgId) {
      return res.status(404).json({ error: 'Store not found or access denied' });
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (typeof parsed.data.taxRate === 'number') {
      updateData.taxRate = parsed.data.taxRate.toFixed(4);
    }

    const [updatedStore] = await db.update(stores)
      .set(updateData)
      .where(eq(stores.id, storeId))
      .returning();

    if (typeof parsed.data.isActive === 'boolean' && parsed.data.isActive !== store.isActive) {
      await db
        .update(users)
        .set({ isActive: parsed.data.isActive } as any)
        .where(and(eq(users.storeId, storeId), eq(users.isAdmin, false)));
    }

    res.json(updatedStore);
  });
}


