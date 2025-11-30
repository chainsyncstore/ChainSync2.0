import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { stores, users } from '@shared/schema';
import { db } from '../db';
import { mergeNotificationPreferences, normalizeNotificationPreferences } from '../lib/notification-preferences';
import { requireAuth } from '../middleware/authz';

const EmailChannelSchema = z.object({
  email: z.boolean().optional(),
});

const InAppChannelSchema = z.object({
  inApp: z.boolean().optional(),
});

const DualChannelSchema = z.object({
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

const NotificationSettingsSchema = z.object({
  systemHealth: EmailChannelSchema.optional(),
  storePerformance: DualChannelSchema.optional(),
  inventoryRisks: InAppChannelSchema.optional(),
  billing: EmailChannelSchema.optional(),
  paymentAlerts: InAppChannelSchema.optional(),
  aiInsights: InAppChannelSchema.optional(),
  // Legacy flat toggles kept for backwards compatibility
  lowStockAlerts: z.boolean().optional(),
  salesReports: z.boolean().optional(),
  systemUpdates: z.boolean().optional(),
});

const IntegrationSettingsSchema = z.object({
  paymentGateway: z.boolean().optional(),
  accountingSoftware: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
});

const SettingsSchema = z.object({
  notifications: NotificationSettingsSchema.optional(),
  integrations: IntegrationSettingsSchema.optional(),
});

type NotificationScope =
  | { type: 'org' }
  | { type: 'store'; storeId: string | null; storeName: string | null };


const resolveNotificationScope = async (userId: string): Promise<NotificationScope> => {
  const [userRow] = await db
    .select({ isAdmin: users.isAdmin, storeId: users.storeId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    return { type: 'org' };
  }

  if (userRow.isAdmin) {
    return { type: 'org' };
  }

  const storeId = userRow.storeId ?? null;
  if (!storeId) {
    return { type: 'store', storeId: null, storeName: null };
  }

  const [storeRow] = await db
    .select({ name: stores.name })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  return { type: 'store', storeId, storeName: storeRow?.name ?? null };
};

export async function registerSettingsRoutes(app: Express) {
  // Get user settings
  app.get('/api/settings', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId as string;
    try {
      const [user] = await db
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const rawSettings = (user.settings || {}) as Record<string, any>;
      const normalizedNotifications = normalizeNotificationPreferences(rawSettings.notifications);
      const notificationScope = await resolveNotificationScope(userId);
      res.json({ ...rawSettings, notifications: normalizedNotifications, notificationScope });
    } catch (error) {
      console.error('Failed to get settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update user settings
  app.put('/api/settings', requireAuth, async (req: Request, res: Response) => {
    const parsed = SettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = req.session.userId as string;
    try {
      const [user] = await db
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentSettings = (user.settings || {}) as Record<string, any>;
      const currentNotifications = normalizeNotificationPreferences(currentSettings.notifications);
      const updatedNotifications = mergeNotificationPreferences(currentNotifications, parsed.data.notifications);

      const newSettings = {
        ...currentSettings,
        ...parsed.data,
        notifications: updatedNotifications,
      };

      const [updatedUser] = await db
        .update(users as any)
        .set({ settings: newSettings } as any)
        .where(eq(users.id, userId))
        .returning({ settings: users.settings });

      const updatedSettings = (updatedUser.settings || {}) as Record<string, any>;
      const notificationScope = await resolveNotificationScope(userId);
      const normalized = normalizeNotificationPreferences(updatedSettings.notifications);
      res.json({ ...updatedSettings, notifications: normalized, notificationScope });
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
