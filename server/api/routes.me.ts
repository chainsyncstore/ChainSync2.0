import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { users, userRoles } from '@shared/schema';
import { db } from '../db';
import { sendEmail, generateProfileUpdateEmail } from '../email';
import { logger } from '../lib/logger';
import { securityAuditService } from '../lib/security-audit';
import { requireAuth } from '../middleware/authz';
import { storage } from '../storage';
import { SubscriptionService } from '../subscription/service';

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ['confirmPassword'],
});

const ProfileUpdateSchema = z.object({
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  companyName: z.string().max(255).optional(),
  location: z.string().max(50).optional(),
  password: z.string().min(8).optional(), // for re-auth if email changes
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const subscriptionService = new SubscriptionService();

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export async function registerMeRoutes(app: Express) {
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isAdmin = Boolean((user as any).isAdmin);
    const role = ((user as any).role || (isAdmin ? 'ADMIN' : '')).toString().toUpperCase() || undefined;
    const storeId = (user as any).storeId ?? null;
    const orgId = (user as any).orgId ?? null;
    const twofaVerified = Boolean((user as any).twofaVerified);

    let subscriptionSummary: Record<string, unknown> | null = null;
    try {
      const subscription = await subscriptionService.getSubscriptionByUserId(user.id);
      if (subscription) {
        subscriptionSummary = {
          id: subscription.id,
          status: (subscription.status as string | null | undefined)?.toString() ?? null,
          tier: subscription.tier ?? null,
          trialEndsAt: toIsoString(subscription.trialEndDate as any),
          autopayEnabled: Boolean(subscription.autopayEnabled),
          autopayProvider: subscription.autopayProvider ?? null,
          autopayConfiguredAt: toIsoString(subscription.autopayConfiguredAt as any),
          autopayLastStatus: subscription.autopayLastStatus ?? null,
        };
      }
    } catch (subscriptionError) {
      logger.warn('Failed to load user subscription', {
        userId,
        error: subscriptionError instanceof Error ? subscriptionError.message : String(subscriptionError),
      });
    }

    res.json({
      id: user.id,
      email: user.email,
      isAdmin,
      role,
      storeId,
      orgId,
      firstName: (user as any).firstName ?? null,
      lastName: (user as any).lastName ?? null,
      phone: (user as any).phone ?? null,
      requiresPasswordChange: Boolean((user as any)?.requiresPasswordChange),
      twofaVerified,
      subscription: subscriptionSummary,
    });
  });

  app.get('/api/auth/me/roles', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    res.json(roles);
  });

  app.post('/api/auth/me/change-password', requireAuth, async (req: Request, res: Response) => {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = req.session.userId as string;
    const { currentPassword, newPassword } = parsed.data;

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: 'User not found or password not set' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await storage.updateUser(userId, {
        passwordHash: newPasswordHash,
        password: newPasswordHash,
        requiresPasswordChange: false,
      } as any);

      if (req.session) {
        (req.session as any).requiresPasswordChange = false;
        req.session.save(() => undefined);
      }

      const updatedUser = await storage.getUser(userId);

      res.status(200).json({
        message: 'Password updated successfully',
        user: updatedUser ? {
          id: updatedUser.id,
          email: updatedUser.email,
          requiresPasswordChange: Boolean((updatedUser as any)?.requiresPasswordChange),
        } : null,
      });
    } catch (error) {
      logger.error('Password change error', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/auth/me/profile', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId as string;
    const parsed = ProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const updates = parsed.data;
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      // If email is changing, require password and check uniqueness
      if (updates.email && updates.email !== user.email) {
        if (!updates.password) {
          return res.status(401).json({ error: 'Password required to change email' });
        }
        const isValid = await storage.getUserByEmail(updates.email);
        if (isValid) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        const AuthService = (await import('../auth')).AuthService;
        const ok = await AuthService.comparePassword(updates.password, user.password);
        if (!ok) {
          return res.status(401).json({ error: 'Incorrect password' });
        }
      }
      // Save old values for email
      const oldProfile = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        companyName: user.companyName,
        location: user.location,
      };
      // Remove password from update
      delete (updates as Record<string, unknown>).password;
      const sanitizedUpdates: Record<string, unknown> = { ...updates };
      const updatedUser = await storage.updateUser(userId, sanitizedUpdates);
      // Audit log
      securityAuditService.logDataAccessEvent('data_write', {
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
        requestId: Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : (req.headers['x-request-id'] || ''),
      }, 'user_profile', { oldProfile, newProfile: updates });
      // Send confirmation email
      await sendEmail(generateProfileUpdateEmail(updatedUser.email, oldProfile, updates));
      res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
      logger.error('Profile update error', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}


