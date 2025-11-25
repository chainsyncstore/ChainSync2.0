import bcrypt from 'bcrypt';
import { and, eq, gte, isNull } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { users, userRoles, profileUpdateOtps } from '@shared/schema';
import { db } from '../db';
import { sendEmail, generateProfileUpdateEmail, generateProfileChangeOtpEmail } from '../email';
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

const ProfileOtpRequestSchema = z.object({
  email: z.string().email().max(255),
});

const ProfileOtpVerifySchema = z.object({
  email: z.string().email().max(255),
  code: z.string().min(4).max(10),
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    profileOtp?: {
      email: string;
      verifiedAt: number;
    };
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

  app.post('/api/auth/me/profile-otp/request', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId as string;
    const parsed = ProfileOtpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const newEmail = parsed.data.email.trim().toLowerCase();
      if (newEmail === (user.email || '').toLowerCase()) {
        return res.status(400).json({ error: 'New email must differ from current email' });
      }

      const existing = await storage.getUserByEmail(newEmail);
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.delete(profileUpdateOtps).where(eq(profileUpdateOtps.userId, userId));
      await db.insert(profileUpdateOtps).values({
        userId,
        email: newEmail,
        code,
        expiresAt,
        consumedAt: null,
      } as unknown as typeof profileUpdateOtps.$inferInsert);

      await sendEmail(
        generateProfileChangeOtpEmail({
          to: newEmail,
          userName: (user as any)?.firstName ?? user.email,
          code,
          expiresAt,
        })
      );

      return res.json({ status: 'sent', expiresAt });
    } catch (error) {
      logger.error('Failed to issue profile OTP', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  app.post('/api/auth/me/profile-otp/verify', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId as string;
    const parsed = ProfileOtpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    try {
      const now = new Date();
      const [record] = await db
        .select()
        .from(profileUpdateOtps)
        .where(
          and(
            eq(profileUpdateOtps.userId, userId),
            eq(profileUpdateOtps.email, parsed.data.email.trim().toLowerCase()),
            eq(profileUpdateOtps.code, parsed.data.code.trim()),
            isNull(profileUpdateOtps.consumedAt),
            gte(profileUpdateOtps.expiresAt, now)
          )
        )
        .limit(1);

      if (!record) {
        return res.status(401).json({ error: 'Invalid or expired verification code' });
      }

      await db
        .update(profileUpdateOtps)
        .set({ consumedAt: now } as any)
        .where(eq(profileUpdateOtps.id, record.id));

      if (req.session) {
        (req.session as any).profileOtp = {
          email: record.email,
          verifiedAt: Date.now(),
        };
        req.session.save(() => undefined);
      }

      return res.json({ status: 'verified' });
    } catch (error) {
      logger.error('Failed to verify profile OTP', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Could not verify code' });
    }
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

        const profileOtpSession = (req.session as any)?.profileOtp;
        const maxOtpAgeMs = 15 * 60 * 1000;
        const otpFresh = profileOtpSession && profileOtpSession.email === updates.email && Date.now() - profileOtpSession.verifiedAt <= maxOtpAgeMs;
        if (!otpFresh) {
          return res.status(401).json({ error: 'Email change requires verification code' });
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

      if (req.session?.profileOtp && updates.email && req.session.profileOtp.email === updates.email) {
        delete req.session.profileOtp;
        req.session.save(() => undefined);
      }
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


