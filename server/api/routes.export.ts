import type { Express, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { requireAuth } from '../middleware/authz';
import { resolveStoreAccess } from '../middleware/store-access';
import { storage } from '../storage';

const DATASETS = new Set(['products', 'transactions', 'customers', 'inventory']);

type Dataset = 'products' | 'transactions' | 'customers' | 'inventory';

type ExportFormat = 'csv' | 'json';

const parseFormat = (value?: string | string[]): ExportFormat => {
  if (!value) return 'csv';
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized?.toLowerCase() === 'json' ? 'json' : 'csv';
};

const parseDate = (value?: string | string[]): Date | undefined => {
  if (!value) return undefined;
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export async function registerExportRoutes(app: Express) {
  app.get('/api/stores/:storeId/export/:dataset', requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const datasetParam = (req.params.dataset || '').toLowerCase();
      if (!DATASETS.has(datasetParam)) {
        return res.status(404).json({ error: 'Dataset not found' });
      }
      const dataset = datasetParam as Dataset;

      const format = parseFormat(req.query.format as string | string[]);
      if (format !== 'csv' && format !== 'json') {
        return res.status(400).json({ error: 'Unsupported export format' });
      }

      const access = await resolveStoreAccess(req, storeId, {
        allowInactive: true,
        allowAdminOverride: true,
        allowCashier: false,
      });
      if ('error' in access) {
        return res.status(access.error.status).json({ error: access.error.message });
      }

      let payload: string | unknown;
      const filenameBase = `${dataset}-export-${storeId}`;

      if (dataset === 'transactions') {
        let startDate = parseDate(req.query.startDate as string | string[]);
        let endDate = parseDate(req.query.endDate as string | string[]);
        const now = new Date();
        if (!endDate) {
          endDate = now;
        }
        if (!startDate) {
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        if (startDate >= endDate) {
          return res.status(400).json({ error: 'startDate must be before endDate' });
        }
        payload = await storage.exportTransactions(storeId, startDate, endDate, format);
      } else if (dataset === 'products') {
        payload = await storage.exportProducts(storeId, format);
      } else if (dataset === 'customers') {
        payload = await storage.exportCustomers(storeId, format);
      } else {
        payload = await storage.exportInventory(storeId, format);
      }

      if (format === 'csv') {
        const csvContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
        return res.send(csvContent);
      }

      res.json({ data: payload, format, dataset, storeId });
    } catch (error) {
      logger.error('Failed to generate export', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });
      res.status(500).json({ error: 'Failed to generate export' });
    }
  });
}
