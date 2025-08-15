import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, userRoles, ipWhitelist } from '@shared/prd-schema';
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

// Extract client IP with support for X-Forwarded-For behind proxies (Render)
export function getClientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const candidate = xff || req.ip || (req as any).connection?.remoteAddress || req.socket?.remoteAddress || '';
  return candidate.startsWith('::ffff:') ? candidate.substring(7) : candidate;
}

// Minimal IPv4 CIDR matcher; also supports exact IP equality
export function ipMatchesCidrOrIp(allowed: string, ipAddress: string): boolean {
  const ip = ipAddress.trim();
  const rule = allowed.trim();
  if (!rule || !ip) return false;
  if (!rule.includes('/')) {
    return rule === ip;
  }
  const [base, prefixLenStr] = rule.split('/');
  const prefixLen = Number(prefixLenStr);
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
  const ipToInt = (v: string) => {
    const parts = v.split('.').map(n => Number(n));
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  };
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt == null || baseInt == null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export async function enforceIpWhitelist(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.isAdmin) return next();

  const clientIp = getClientIp(req);

  // Determine role to enforce (fallback to CASHIER)
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  const role = roles[0]?.role || 'CASHIER';
  const wl = await db.select().from(ipWhitelist).where(eq(ipWhitelist.orgId, user.orgId!));
  const allowed = wl.some(w => (w.role === role) && ipMatchesCidrOrIp(w.cidrOrIp, clientIp));
  if (!allowed) return res.status(403).json({ error: 'IP not allowed' });
  next();
}

