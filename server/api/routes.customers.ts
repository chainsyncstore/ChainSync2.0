import { and, eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { customers, users, stores } from '@shared/prd-schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth, enforceIpWhitelist } from '../middleware/authz';

const CreateCustomerSchema = z.object({
  phone: z.string().min(3).max(32),
  name: z.string().max(255).optional().nullable(),
});

export async function registerCustomerRoutes(app: Express) {
  // GET /customers?phone=
  app.get('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId as string | undefined;
      let orgId: string | undefined;
      if (userId) {
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        orgId = me?.orgId || undefined;
      }
      if (!orgId) {
        const storeId = String(req.query.storeId || '').trim();
        if (storeId) {
          const s = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
          orgId = s[0]?.orgId;
        }
      }
      if (!orgId) return res.status(400).json({ error: 'Missing org' });

      const phone = String(req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      const rows = await db.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.phone, phone))).limit(1);
      res.json(rows[0] || null);
    } catch (error) {
      logger.error('Failed to search customers', {
        userId: req.session?.userId,
        query: req.query,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  // POST /customers
  app.post('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = CreateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      let orgId: string | undefined;
      if (userId) {
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        orgId = me?.orgId || undefined;
      }
      if (!orgId && (req.body?.storeId || req.query?.storeId)) {
        const storeId = String(req.body?.storeId || (req.query as any)?.storeId || '').trim();
        const s = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
        orgId = s[0]?.orgId;
      }
      if (!orgId) return res.status(400).json({ error: 'Missing org' });

      // Upsert by (orgId, phone)
      const existing = await db.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.phone, parsed.data.phone))).limit(1);
      if (existing[0]) return res.json(existing[0]);

      const [created] = await db.insert(customers).values({
        orgId,
        phone: parsed.data.phone,
        name: parsed.data.name || null,
      } as unknown as typeof customers.$inferInsert).returning();

      return res.status(201).json(created);
    } catch (error) {
      logger.error('Failed to create customer', {
        userId: req.session?.userId,
        body: req.body,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to create customer' });
    }
  });
}


