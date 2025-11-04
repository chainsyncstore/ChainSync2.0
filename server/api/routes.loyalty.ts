import { and, desc, eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { loyaltyAccounts, loyaltyTransactions, users } from '@shared/prd-schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';

const EarnSchema = z.object({
  points: z.number().int().positive(),
  reason: z.string().max(255).default('earn'),
});

const RedeemSchema = z.object({
  points: z.number().int().positive(),
  reason: z.string().max(255).default('redeem'),
});

export async function registerLoyaltyRoutes(app: Express) {
  // GET /loyalty/:customerId
  app.get('/api/loyalty/:customerId', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

      const customerId = req.params.customerId;
      const [acct] = await db.select().from(loyaltyAccounts)
        .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId)))
        .limit(1);
      if (!acct) return res.json({ points: 0, tier: null, transactions: [] });

      const tx = await db.select().from(loyaltyTransactions)
        .where(eq(loyaltyTransactions.loyaltyAccountId, acct.id))
        .orderBy(desc(loyaltyTransactions.createdAt))
        .limit(50);
      return res.json({ points: acct.points, tier: acct.tier, transactions: tx });
    } catch (error) {
      logger.error('Failed to load loyalty account', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to load loyalty' });
    }
  });

  // POST /loyalty/:id/earn
  app.post('/api/loyalty/:customerId/earn', requireAuth, enforceIpWhitelist, requireRole('CASHIER'), async (req: Request, res: Response) => {
    const parsed = EarnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });
      const customerId = req.params.customerId;

      const client = (db as any).client;
      const hasTx = !!client;
      const pg = hasTx ? await client.connect() : null;
      try {
        if (hasTx && pg) await pg.query('BEGIN');

        // Ensure account
        const [acctExisting] = await db.select().from(loyaltyAccounts)
          .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId))).limit(1);
        let account = acctExisting;
        if (!account) {
          const inserted = await db.insert(loyaltyAccounts).values({ orgId: me.orgId, customerId, points: 0 } as any).returning();
          account = inserted[0];
        }

        const newPoints = Number(account.points) + parsed.data.points;
        const [updated] = await db
          .update(loyaltyAccounts)
          .set({ points: newPoints } as any)
          .where(eq(loyaltyAccounts.id, account.id))
          .returning();

        await db.insert(loyaltyTransactions).values({
          loyaltyAccountId: account.id,
          points: parsed.data.points,
          reason: parsed.data.reason,
        } as any);

        if (hasTx && pg) await pg.query('COMMIT');
        return res.json({ points: updated.points });
      } catch (error) {
        if (hasTx && pg) {
          try {
            await pg.query('ROLLBACK');
          } catch (rollbackError) {
            logger.warn('Loyalty earn rollback failed', {
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            });
          }
        }
        logger.error('Failed to earn loyalty points', {
          userId,
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        return res.status(500).json({ error: 'Failed to earn points' });
      } finally {
        if (hasTx && pg) pg.release();
      }
    } catch (error) {
      logger.error('Failed to earn loyalty points', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to earn points' });
    }
  });

  // POST /loyalty/:id/redeem
  app.post('/api/loyalty/:customerId/redeem', requireAuth, enforceIpWhitelist, requireRole('CASHIER'), async (req: Request, res: Response) => {
    const parsed = RedeemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });
      const customerId = req.params.customerId;

      const client = (db as any).client;
      const hasTx = !!client;
      const pg = hasTx ? await client.connect() : null;
      try {
        if (hasTx && pg) await pg.query('BEGIN');

        // Load account
        const [acct] = await db.select().from(loyaltyAccounts)
          .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId))).limit(1);
        if (!acct || acct.points < parsed.data.points) {
          await pg.query('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient points' });
        }

        const newPoints = Number(acct.points) - parsed.data.points;
        const [updated] = await db
          .update(loyaltyAccounts)
          .set({ points: newPoints } as any)
          .where(eq(loyaltyAccounts.id, acct.id))
          .returning();

        await db.insert(loyaltyTransactions).values({
          loyaltyAccountId: acct.id,
          points: -parsed.data.points,
          reason: parsed.data.reason,
        } as any);

        if (hasTx && pg) await pg.query('COMMIT');
        return res.json({ points: updated.points });
      } catch (error) {
        if (hasTx && pg) {
          try {
            await pg.query('ROLLBACK');
          } catch (rollbackError) {
            logger.warn('Loyalty redeem rollback failed', {
              error: rollbackError instanceof Error ? error.message : String(rollbackError)
            });
          }
        }
        logger.error('Failed to redeem loyalty points', {
          userId,
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        return res.status(500).json({ error: 'Failed to redeem points' });
      } finally {
        if (hasTx && pg) pg.release();
      }
    } catch (error) {
      logger.error('Failed to redeem loyalty points', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to redeem points' });
    }
  });
}


