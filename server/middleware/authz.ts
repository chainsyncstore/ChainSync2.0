import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { users, userRoles, organizations, subscriptions } from '@shared/schema';
import { db } from '../db';
import { getPlan } from '../lib/plans';
import { storage } from '../storage';

const ipWhitelistEnforced = (process.env.IP_WHITELIST_ENFORCED ?? 'true').toLowerCase() !== 'false';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  next();
}

type RoleUpper = 'ADMIN' | 'MANAGER' | 'CASHIER';
type RoleLower = 'admin' | 'manager' | 'cashier';
type AnyRole = RoleUpper | RoleLower;

export function requireRole(required: AnyRole | AnyRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // In test mode, do not bypass RBAC entirely. Enforce session and roles so tests get stable responses.
    // Admins are always allowed. Non-admins must have one of the required roles.
    // This mirrors production logic while remaining test-friendly.
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.isAdmin) return next();
    // Enforce org activation/lock for non-admins globally
    if (!user.orgId) return res.status(400).json({ error: 'Organization not set' });
    const orgRows = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
    const org = orgRows[0];
    const now = new Date();
    if (!org?.isActive) return res.status(402).json({ error: 'Organization inactive' });
    if (org.lockedUntil && new Date(org.lockedUntil) > now) return res.status(402).json({ error: 'Organization locked' });

    // Enforce subscription plan role limits
    const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, user.orgId)))[0];
    const plan = getPlan(sub?.planCode || 'basic');
    const requiredList = (Array.isArray(required) ? required : [required]) as AnyRole[];
    const normalizedRequired = requiredList.map(r => (typeof r === 'string' ? r.toUpperCase() : r)) as RoleUpper[];
    const roleIsAvailableInPlan = normalizedRequired.every(r => plan.availableRoles.includes(r));
    if (!roleIsAvailableInPlan) return res.status(403).json({ error: 'Role not available in your plan' });

    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const hasRole = roles.some(r => normalizedRequired.includes(r.role as RoleUpper));
    if (!hasRole) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export function requireManagerWithStore() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const rows = await db.select({
      id: users.id,
      orgId: users.orgId,
      storeId: users.storeId,
      isAdmin: users.isAdmin,
    }).from(users).where(eq(users.id, userId));
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.isAdmin) return res.status(403).json({ error: 'Admins cannot access this endpoint' });
    if (!user.orgId) return res.status(400).json({ error: 'Organization not set' });

    const orgRows = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
    const org = orgRows[0];
    const now = new Date();
    if (!org?.isActive) return res.status(402).json({ error: 'Organization inactive' });
    if (org.lockedUntil && new Date(org.lockedUntil) > now) return res.status(402).json({ error: 'Organization locked' });

    const sub = (await db.select().from(subscriptions).where(eq(subscriptions.orgId, user.orgId)))[0];
    const plan = getPlan(sub?.planCode || 'basic');
    if (!plan.availableRoles.includes('MANAGER')) {
      return res.status(403).json({ error: 'Role not available in your plan' });
    }

    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    const hasManagerRole = roles.some((r) => String(r.role).toUpperCase() === 'MANAGER');
    if (!hasManagerRole) return res.status(403).json({ error: 'Manager role required' });

    if (!user.storeId) {
      return res.status(403).json({ error: 'Store assignment required' });
    }

    (req as any).managerStoreId = user.storeId;
    (req as any).managerOrgId = user.orgId;
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
  if (!ipWhitelistEnforced || process.env.NODE_ENV === 'test') return next();
  const userId = req.session?.userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.isAdmin) return next();

  const clientIp = getClientIp(req);
  const allowed = await storage.checkIpWhitelisted(clientIp, userId);
  if (!allowed) return res.status(403).json({ error: 'IP not allowed' });
  next();
}

