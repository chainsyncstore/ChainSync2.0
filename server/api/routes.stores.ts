import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { stores, users } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, requireRole, enforceIpWhitelist } from '../middleware/authz';

const CreateStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  currency: z.enum(['NGN', 'USD']).optional().default('NGN'),
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

    const [created] = await db.insert(stores).values({
      orgId: me.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
      currency: parsed.data.currency,
    } as any).returning();

    return res.status(201).json(created);
  });
}


