import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { users, userRoles } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authenticator } from 'otplib';
import jwt from 'jsonwebtoken';
import { securityAuditService } from '../lib/security-audit';
import { monitoringService } from '../lib/monitoring';
import { logger, extractLogContext } from '../lib/logger';

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
    const context = extractLogContext(req);
    
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      securityAuditService.logApplicationEvent('input_validation_failed', context, 'login_schema', {
        errors: parsed.error.errors
      });
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    const { password } = (parsed.data as any);
    const email = (parsed.data as any).email || (parsed.data as any).username;
    
    try {
      const found = await db.select().from(users).where(eq(users.email, email));
      const user = found[0];
      
      if (!user) {
        securityAuditService.logAuthenticationEvent('login_failed', context, {
          email,
          reason: 'user_not_found'
        });
        monitoringService.recordAuthEvent('login_failed', context);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        securityAuditService.logAuthenticationEvent('login_failed', { 
          ...context, 
          userId: user.id 
        }, {
          email,
          reason: 'invalid_password'
        });
        monitoringService.recordAuthEvent('login_failed', { ...context, userId: user.id });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Admins require 2FA
      if (user.isAdmin && user.requires2fa && !req.session?.twofaVerified) {
        req.session!.pendingUserId = user.id;
        securityAuditService.logAuthenticationEvent('mfa_challenge', {
          ...context,
          userId: user.id
        }, { email, role: 'admin' });
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
      
      // Log successful authentication
      securityAuditService.logAuthenticationEvent('login_success', {
        ...context,
        userId: user.id,
        storeId: (primary as any)?.storeId
      }, { email, role });
      
      monitoringService.recordAuthEvent('login', {
        ...context,
        userId: user.id,
        storeId: (primary as any)?.storeId
      });
      
      logger.info('User logged in successfully', {
        ...context,
        userId: user.id,
        role,
        email
      });
      
      res.json({ id: user.id, email: user.email, role, isAdmin: user.isAdmin });
    } catch (error) {
      logger.error('Login error', context, error as Error);
      securityAuditService.logApplicationEvent('error_enumeration', context, 'login', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
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
    const context = extractLogContext(req);
    const userId = req.session?.pendingUserId || req.session?.userId;
    
    if (!userId) {
      securityAuditService.logAuthenticationEvent('mfa_failed', context, {
        reason: 'no_authenticated_session'
      });
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const code = String((req.body?.code || req.body?.otp || '').toString());
    if (!code) {
      securityAuditService.logAuthenticationEvent('mfa_failed', { 
        ...context, 
        userId 
      }, {
        reason: 'missing_code'
      });
      return res.status(400).json({ error: 'Code required' });
    }
    
    try {
      const result = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId));
      const secret = result[0]?.totpSecret;
      
      if (!secret) {
        securityAuditService.logAuthenticationEvent('mfa_failed', { 
          ...context, 
          userId 
        }, {
          reason: '2fa_not_setup'
        });
        return res.status(400).json({ error: '2FA not set up' });
      }
      
      const valid = authenticator.check(code, secret);
      if (!valid) {
        securityAuditService.logAuthenticationEvent('mfa_failed', { 
          ...context, 
          userId 
        }, {
          reason: 'invalid_code'
        });
        monitoringService.recordAuthEvent('login_failed', { ...context, userId });
        return res.status(400).json({ error: 'Invalid code' });
      }
      
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
      
      // Log successful 2FA verification
      securityAuditService.logAuthenticationEvent('mfa_success', {
        ...context,
        userId,
        storeId: (primary as any)?.storeId
      }, { 
        email: u.email, 
        role 
      });
      
      monitoringService.recordAuthEvent('login', {
        ...context,
        userId,
        storeId: (primary as any)?.storeId
      });
      
      logger.info('2FA verification successful', {
        ...context,
        userId,
        email: u.email,
        role
      });
      
      res.json({ success: true, user: { id: u.id, email: u.email, role, isAdmin: u.isAdmin } });
    } catch (error) {
      logger.error('2FA verification error', { ...context, userId }, error as Error);
      securityAuditService.logApplicationEvent('error_enumeration', { ...context, userId }, '2fa_verify', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const context = extractLogContext(req);
    const userId = req.session?.userId;
    
    if (userId) {
      // Log logout event
      securityAuditService.logAuthenticationEvent('logout', {
        ...context,
        userId
      }, {});
      
      monitoringService.recordAuthEvent('logout', {
        ...context,
        userId
      });
      
      logger.info('User logged out', {
        ...context,
        userId
      });
    }
    
    req.session?.destroy(() => {
      res.json({ ok: true });
    });
  });

  // WebSocket auth token (simple JWT containing userId and optional storeId)
  app.get('/api/auth/realtime-token', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const token = jwt.sign({ userId }, process.env.SESSION_SECRET || 'changeme', { expiresIn: '1h' });
    res.json({ token });
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


