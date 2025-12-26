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
  taxIncluded: z.boolean().optional().default(false),
});

const UpdateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxRate: taxRateSchema.optional(),
  taxIncluded: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function registerStoreRoutes(app: Express) {
  // List stores for current user's org
  app.get('/api/stores', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });
    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) return res.json([]);

    // Role-based access control:
    // - Admins see all stores in the org
    // - Managers/Cashiers only see their assigned store
    let query = db.select().from(stores).where(eq(stores.orgId, me.orgId));

    // Check for admin role (case-insensitive for safety, though DB enum is usually uppercase)
    const isAdmin = me.role?.toLowerCase() === 'admin' || me.isAdmin === true;

    if (!isAdmin) {
      if (!me.storeId) {
        // If user is not admin and has no assigned store, they see nothing
        return res.json([]);
      }
      query = db.select().from(stores).where(and(
        eq(stores.orgId, me.orgId),
        eq(stores.id, me.storeId)
      ));
    }

    const rows = await query.limit(200);
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
    const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, me.orgId)).limit(1))[0];
    const plan = getPlan((sub?.planCode ?? sub?.tier ?? 'basic').toLowerCase());
    const storeCountResult = await db.execute(
      sql`select count(*) from stores where org_id = ${me.orgId} and coalesce(is_active, true) = true`
    );
    const storeCount = parseInt((storeCountResult.rows[0] as any).count, 10);

    if (Number.isFinite(plan.maxStores) && storeCount >= plan.maxStores) {
      return res.status(403).json({ error: 'Store limit reached. Upgrade to add more stores.' });
    }

    const taxRate = parsed.data.taxRate ?? 0.085;

    const [created] = await db.insert(stores).values({
      orgId: me.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      currency: parsed.data.currency,
      taxRate: Number.isFinite(taxRate) ? taxRate.toFixed(4) : '0.0850',
      taxIncluded: parsed.data.taxIncluded ?? false,
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

    const isActivatingStore = parsed.data.isActive === true && store.isActive === false;
    if (isActivatingStore) {
      const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, me.orgId)).limit(1))[0];
      const plan = getPlan((sub?.planCode ?? sub?.tier ?? 'basic').toLowerCase());
      if (Number.isFinite(plan.maxStores)) {
        const activeStoreCountResult = await db.execute(
          sql`select count(*) from stores where org_id = ${me.orgId} and coalesce(is_active, true) = true`
        );
        const activeStoreCount = parseInt((activeStoreCountResult.rows[0] as any).count, 10);
        if (activeStoreCount >= plan.maxStores) {
          return res.status(403).json({ error: 'Store limit reached. Upgrade your plan to reactivate this store.' });
        }
      }
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

  // Bulk reactivate stores (used after subscription reactivation/upgrade)
  const ReactivateStoresSchema = z.object({
    storeIds: z.array(z.string().uuid()).min(1),
  });

  app.post('/api/stores/reactivate', requireAuth, requireRole('ADMIN'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ReactivateStoresSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    const me = (await db.select().from(users).where(eq(users.id, currentUserId)))[0] as any;
    if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

    // Get subscription and plan
    const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, me.orgId)).limit(1))[0];
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const plan = getPlan((sub?.planCode ?? sub?.tier ?? 'basic').toLowerCase());
    
    // Get current active store count
    const activeStoreCountResult = await db.execute(
      sql`select count(*) from stores where org_id = ${me.orgId} and coalesce(is_active, true) = true`
    );
    const activeStoreCount = parseInt((activeStoreCountResult.rows[0] as any).count, 10);

    // Check if we have a store limit
    if (Number.isFinite(plan.maxStores)) {
      const requestedCount = parsed.data.storeIds.length;
      const newActiveCount = activeStoreCount + requestedCount;
      
      if (newActiveCount > plan.maxStores) {
        return res.status(403).json({ 
          error: 'Store limit exceeded',
          message: `Your plan allows up to ${plan.maxStores} stores. You currently have ${activeStoreCount} active stores. You can reactivate up to ${plan.maxStores - activeStoreCount} more store(s).`,
          maxAllowed: plan.maxStores,
          currentActive: activeStoreCount,
          requested: requestedCount
        });
      }
    }

    // Verify all stores belong to the organization and are currently inactive
    const storesToReactivate = await db
      .select()
      .from(stores)
      .where(
        and(
          eq(stores.orgId, me.orgId),
          sql`${stores.id} = ANY(${parsed.data.storeIds})`
        )
      );

    if (storesToReactivate.length !== parsed.data.storeIds.length) {
      return res.status(400).json({ error: 'Some stores not found or do not belong to your organization' });
    }

    // Check if any stores are already active
    const alreadyActive = storesToReactivate.filter(s => s.isActive === true);
    if (alreadyActive.length > 0) {
      return res.status(400).json({ 
        error: 'Some stores are already active',
        alreadyActive: alreadyActive.map(s => s.id)
      });
    }

    // Reactivate the stores
    const now = new Date();
    await db
      .update(stores)
      .set({
        isActive: true as any,
        updatedAt: now as any,
      } as any)
      .where(
        sql`${stores.id} = ANY(${parsed.data.storeIds})`
      );

    // Reactivate users associated with these stores
    await db
      .update(users)
      .set({ isActive: true as any } as any)
      .where(
        and(
          sql`${users.storeId} = ANY(${parsed.data.storeIds})`,
          eq(users.isAdmin, false)
        )
      );

    // Get updated store list
    const updatedStores = await db
      .select()
      .from(stores)
      .where(
        sql`${stores.id} = ANY(${parsed.data.storeIds})`
      );

    res.json({
      success: true,
      reactivated: updatedStores.length,
      stores: updatedStores
    });
  });
}


