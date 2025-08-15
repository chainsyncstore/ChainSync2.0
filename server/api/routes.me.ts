import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { users, userRoles, stores } from '@shared/prd-schema';
import { eq } from 'drizzle-orm';

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
}


