import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { users } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/authz';

const NotificationSettingsSchema = z.object({
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

export async function registerSettingsRoutes(app: Express) {
  // Get user settings
  app.get('/api/settings', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId as string;
    try {
      const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user.settings || {});
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
      const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentSettings = (user.settings || {}) as Record<string, any>;
      const newSettings = { ...currentSettings, ...parsed.data };

      const [updatedUser] = await db.update(users)
        .set({ settings: newSettings })
        .where(eq(users.id, userId))
        .returning({ settings: users.settings });

      res.json(updatedUser.settings);
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
