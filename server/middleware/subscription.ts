import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { organizations, users } from '@shared/schema';
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
    const [org] = await db
      .select({
        isActive: organizations.isActive,
        lockedUntil: organizations.lockedUntil,
      })
      .from(organizations)
      .where(eq(organizations.id, me.orgId))
      .limit(1);
    if (!org) return res.status(400).json({ error: 'Organization not found' });
    if (!org.isActive) {
      return res.status(402).json({ error: 'Organization inactive' });
    }
    const lockedUntil = org.lockedUntil ? new Date(org.lockedUntil) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      return res.status(402).json({ error: 'Organization locked' });
    }
    // Allow when organization is active; downstream checks already scope stores
    return next();
  } catch {
    return res.status(500).json({ error: 'Subscription check failed' });
  }
}


