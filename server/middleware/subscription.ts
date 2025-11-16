import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { subscriptions, users } from '@shared/schema';
import { db } from '../db';

// Enforce org active subscription for non-admin users
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV === 'test') return next();
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const me = rows[0];
    if (!me) return res.status(401).json({ error: 'Not authenticated' });
    if (me.isAdmin) return next();
    if (!me.orgId) return res.status(400).json({ error: 'Organization not set' });
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.orgId, me.orgId));
    const sub = subs[0];
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE')) {
      return res.status(402).json({ error: 'Subscription required' });
    }
    // Allow PAST_DUE with grace; client should restrict functionality accordingly
    return next();
  } catch {
    return res.status(500).json({ error: 'Subscription check failed' });
  }
}


