import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/authz';
import { storage } from '../storage';

const normalizeRole = (role?: string): 'ADMIN' | 'MANAGER' | 'CASHIER' => {
  const value = (role || '').toUpperCase();
  if (value === 'ADMIN') return 'ADMIN';
  if (value === 'MANAGER') return 'MANAGER';
  return 'CASHIER';
};

const CreateUserWhitelistSchema = z.object({
  type: z.literal('user'),
  ipAddress: z.string().min(3),
  userId: z.string().uuid(),
  description: z.string().optional(),
});

const CreateStoreWhitelistSchema = z.object({
  type: z.literal('store'),
  ipAddress: z.string().min(3),
  storeId: z.string().uuid(),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'CASHIER'])).nonempty(),
  description: z.string().optional(),
});

const CreateWhitelistSchema = z.union([CreateUserWhitelistSchema, CreateStoreWhitelistSchema]);

export async function registerIpWhitelistRoutes(app: Express) {
  app.get('/api/ip-whitelist', requireAuth, async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const role = normalizeRole((user as any).role);
    const collected: Map<string, any> = new Map();

    const userEntries = await storage.getIpWhitelistsForUser(userId);
    userEntries.forEach(entry => collected.set(entry.id, { ...entry, scope: 'user' }));

    if (role === 'ADMIN') {
      const orgId = (user as any).orgId;
      if (!orgId) {
        return res.status(400).json({ error: 'Organization not set for admin user' });
      }

      const orgEntries = await storage.getOrgIpWhitelists(orgId);
      orgEntries.forEach(entry => {
        const scope = entry.storeId ? 'store' : 'user';
        collected.set(entry.id, { ...entry, scope });
      });
    } else if (user.storeId) {
      const rolesToInclude = role === 'MANAGER' ? ['MANAGER', 'CASHIER'] : [role];
      for (const r of rolesToInclude) {
        const storeEntries = await storage.getStoreWhitelistsForRole(user.storeId, normalizeRole(r));
        storeEntries.forEach(entry => collected.set(entry.id, { ...entry, scope: 'store' }));
      }
    }

    res.json(Array.from(collected.values()));
  });

  app.post('/api/ip-whitelist', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
    const parsed = CreateWhitelistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const adminId = req.session?.userId as string;

    try {
      if (parsed.data.type === 'user') {
        const entry = await storage.addIpToWhitelist(
          parsed.data.ipAddress,
          parsed.data.userId,
          adminId,
          parsed.data.description,
        );
        return res.status(201).json({ entries: [{ ...entry, scope: 'user' }] });
      }

      const roles = parsed.data.roles.map(r => normalizeRole(r));
      const entries = await storage.addStoreIpToWhitelist({
        ipAddress: parsed.data.ipAddress,
        storeId: parsed.data.storeId,
        roles,
        whitelistedBy: adminId,
        description: parsed.data.description,
      });
      return res.status(201).json({ entries: entries.map(entry => ({ ...entry, scope: 'store' })) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add IP to whitelist';
      return res.status(400).json({ error: message });
    }
  });

  app.delete('/api/ip-whitelist/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Whitelist entry ID is required' });
    }

    await storage.deactivateIpWhitelistEntry(id);
    return res.status(204).end();
  });

  app.get('/api/ip-whitelist/logs', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
    const logs = await storage.getIpAccessLogs(200);
    res.json(logs);
  });
}
