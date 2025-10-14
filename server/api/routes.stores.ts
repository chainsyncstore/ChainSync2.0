import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { stores, users, subscriptions } from '@shared/prd-schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, requireRole, enforceIpWhitelist } from '../middleware/authz';
import { getPlan } from '../lib/plans';

const CreateStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  currency: z.enum(['NGN', 'USD']).optional().default('NGN'),
});

const UpdateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
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

    const [created] = await db.insert(stores).values({
      orgId: me.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      currency: parsed.data.currency,
    } as any).returning();

    return res.status(201).json(created);
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

    const [updatedStore] = await db.update(stores)
      .set(parsed.data)
      .where(eq(stores.id, storeId))
      .returning();

    res.json(updatedStore);
  });
}


