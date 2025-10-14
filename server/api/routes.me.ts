import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { users, userRoles, stores } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/authz';

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ['confirmPassword'],
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function registerMeRoutes(app: Express) {
  app.get('/api/me', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const data = await db.select().from(users).where(eq(users.id, userId));
    const user = data[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, isAdmin: user.isAdmin });
  });

  app.get('/api/me/roles', async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    res.json(roles);
  });

  app.post('/api/me/change-password', requireAuth, async (req: Request, res: Response) => {
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
      await db.update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, userId));

      res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}


