import { and, eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { stores, users } from '@shared/schema';
import { db } from '../db';

// Enforce org active subscription for non-admin users
// Admins always have access, even when subscription is expired
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV === 'test') return next();
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const me = rows[0];
    if (!me) return res.status(401).json({ error: 'Not authenticated' });
    // Admins always have access, even when subscription is expired
    if (me.isAdmin) return next();
    if (!me.orgId) return res.status(400).json({ error: 'Organization not set' });

    const storeFilters = [eq(stores.orgId, me.orgId), eq(stores.isActive, true)];
    if (!me.isAdmin && me.storeId) {
      storeFilters.push(eq(stores.id, me.storeId));
    }

    const [activeStore] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(...storeFilters))
      .limit(1);

    if (!activeStore) {
      return res.status(402).json({ error: 'All stores inactive' });
    }

    return next();
  } catch {
    return res.status(500).json({ error: 'Subscription check failed' });
  }
}


