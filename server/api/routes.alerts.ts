import type { Express, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { requireAuth, requireRole } from '../middleware/authz';
import { resolveStoreAccess } from '../middleware/store-access';
import { storage } from '../storage';

export async function registerAlertsRoutes(app: Express) {
  app.get('/api/alerts/overview', requireRole('ADMIN'), async (req: Request, res: Response) => {
    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user?.orgId) {
        return res.status(400).json({ error: 'Organization not set for user' });
      }

      const overview = await storage.getOrganizationAlertsOverview(user.orgId);
      return res.json(overview);
    } catch (error) {
      logger.error('Failed to load alerts overview', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return res.status(500).json({ error: 'Failed to load alerts overview' });
    }
  });

  app.get('/api/stores/:storeId/alerts', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, storeId, { allowCashier: false });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    try {
      const details = await storage.getStoreAlertDetails(storeId);
      return res.json(details);
    } catch (error) {
      logger.error('Failed to load store alert details', {
        storeId,
        userId: req.session?.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load alerts' });
    }
  });
}
