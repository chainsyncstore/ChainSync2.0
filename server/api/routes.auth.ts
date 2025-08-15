import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { users, userRoles } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authenticator } from 'otplib';

const LoginSchema = z.union([
  z.object({ email: z.string().email(), password: z.string().min(8) }),
  z.object({ username: z.string().min(3), password: z.string().min(8) }),
]);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    pendingUserId?: string;
    twofaVerified?: boolean;
  }
}

export async function registerAuthRoutes(app: Express) {
  // CSRF token endpoint for the SPA client
  app.get('/api/auth/csrf-token', async (req: Request, res: Response) => {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    res.cookie('csrf-token', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.json({ csrfToken: token });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const { password } = (parsed.data as any);
    const email = (parsed.data as any).email || (parsed.data as any).username;
    const found = await db.select().from(users).where(eq(users.email, email));
    const user = found[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Admins require 2FA
    if (user.isAdmin && user.requires2fa && !req.session?.twofaVerified) {
      req.session!.pendingUserId = user.id;
      return res.status(200).json({ status: 'otp_required' });
    }

    req.session!.userId = user.id;
    // Determine primary role for backward compatibility
    let role: 'admin' | 'manager' | 'cashier' = user.isAdmin ? 'admin' : 'cashier';
    if (!user.isAdmin) {
      const rows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
      const primary = rows[0];
      if (primary) role = (primary.role as any).toLowerCase();
    }
    res.json({ id: user.id, email: user.email, role, isAdmin: user.isAdmin });
  });

  app.post('/api/auth/2fa/setup', async (req: Request, res: Response) => {
    const userId = req.session?.userId || req.session?.pendingUserId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri('admin@chainsync', process.env.ADMIN_2FA_ISSUER || 'ChainSync', secret);
    await db.update(users).set({ totpSecret: secret, requires2fa: true } as any).where(eq(users.id, userId));
    res.json({ otpauth });
  });

  app.post('/api/auth/2fa/verify', async (req: Request, res: Response) => {
    const userId = req.session?.pendingUserId || req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const code = String((req.body?.code || req.body?.otp || '').toString());
    const result = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId));
    const secret = result[0]?.totpSecret;
    if (!secret) return res.status(400).json({ error: '2FA not set up' });
    const valid = authenticator.check(code, secret);
    if (!valid) return res.status(400).json({ error: 'Invalid code' });
    req.session!.twofaVerified = true;
    req.session!.userId = userId;
    delete (req.session as any).pendingUserId;
    // Return user for client hydration
    const urows = await db.select().from(users).where(eq(users.id, userId));
    const u = urows[0]!;
    let role: 'admin' | 'manager' | 'cashier' = u.isAdmin ? 'admin' : 'cashier';
    if (!u.isAdmin) {
      const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
      const primary = rows[0];
      if (primary) role = (primary.role as any).toLowerCase();
    }
    res.json({ success: true, user: { id: u.id, email: u.email, role, isAdmin: u.isAdmin } });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session?.destroy(() => {
      res.json({ ok: true });
    });
  });

  // Back-compat: return current user with role
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    let role: 'admin' | 'manager' | 'cashier' = u.isAdmin ? 'admin' : 'cashier';
    if (!u.isAdmin) {
      const r = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
      const primary = r[0];
      if (primary) role = (primary.role as any).toLowerCase();
    }
    res.json({ id: u.id, email: u.email, role, isAdmin: u.isAdmin });
  });
}


