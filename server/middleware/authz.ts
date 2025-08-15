import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, userRoles, ipWhitelist, roleEnum } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

export async function requireRole(required: 'ADMIN' | 'MANAGER' | 'CASHIER') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.isAdmin) return next();
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const hasRole = roles.some(r => r.role === required);
    if (!hasRole) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export async function enforceIpWhitelist(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.isAdmin) return next();
  const ip = (req.ip || req.connection.remoteAddress || '').replace('::ffff:', '');
  // Determine role to enforce
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  const role = roles[0]?.role || 'CASHIER';
  const wl = await db.select().from(ipWhitelist).where(eq(ipWhitelist.orgId, user.orgId!));
  const allowed = wl.some(w => (w.role === role) && (w.cidrOrIp === ip));
  if (!allowed) return res.status(403).json({ error: 'IP not allowed' });
  next();
}


