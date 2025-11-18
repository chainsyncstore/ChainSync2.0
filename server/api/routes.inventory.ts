import { parse as csvParse } from 'csv-parse';
import { eq, and, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { QueryResult } from 'pg';
import { z } from 'zod';
import { importJobs, products, stores, users } from '@shared/schema';
import { db } from '../db';
import { logger, extractLogContext } from '../lib/logger';
import { securityAuditService } from '../lib/security-audit';
import { requireAuth, enforceIpWhitelist, requireManagerWithStore, requireRole } from '../middleware/authz';
import { sensitiveEndpointRateLimit } from '../middleware/security';
import { storage } from '../storage';

const toNumber = (value: unknown, fallback = 0): number => {
  if (value == null) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  try {
    const date = value instanceof Date ? value : new Date(value as any);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
};

const parseDateString = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

let productColumnsCache: Set<string> | null = null;

const getProductColumns = async (): Promise<Set<string>> => {
  if (productColumnsCache) {
    return productColumnsCache;
  }

  try {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products'`
    );

    const rows = Array.isArray(result)
      ? result
      : Array.isArray((result as QueryResult<any>).rows)
        ? (result as QueryResult<any>).rows
        : [];

    productColumnsCache = new Set(rows.map((row) => row.column_name));
  } catch (error) {
    logger.warn('Failed to inspect products columns', {
      error: error instanceof Error ? error.message : String(error),
    });

    productColumnsCache = new Set();
  }

  return productColumnsCache;
};

export async function registerInventoryRoutes(app: Express) {
  // Product catalog endpoints expected by client analytics/alerts pages
  app.get('/api/products', requireAuth, async (_req: Request, res: Response) => {
    const rows = await db.select().from(products).limit(1000);
    res.json(rows);
  });

  app.get('/api/products/barcode/:barcode', requireAuth, async (req: Request, res: Response) => {
    const barcode = String(req.params?.barcode ?? '').trim();
    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    const product = await storage.getProductByBarcode(barcode);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const price = (product as any).price ?? (product as any).salePrice ?? (product as any).costPrice ?? '0';

    return res.json({
      id: product.id,
      name: product.name,
      barcode: product.barcode ?? barcode,
      sku: (product as any).sku ?? null,
      price,
    });
  });

  app.get('/api/products/sku/:sku', requireAuth, async (req: Request, res: Response) => {
    const sku = String(req.params?.sku ?? '').trim();
    if (!sku) {
      return res.status(400).json({ error: 'sku is required' });
    }

    const product = await storage.getProductBySku(sku);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(product);
  });

  app.get('/api/products/search', requireAuth, async (req: Request, res: Response) => {
    const query = String((req.query?.name as string) ?? (req.query?.q as string) ?? '').trim();
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const results = await storage.searchProducts(query);
    return res.json(results.slice(0, 15));
  });

  const ManualProductSchema = z.object({
    name: z.string().min(1),
    sku: z.string().trim().min(1).optional(),
    barcode: z.string().trim().min(1).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    price: z.number().min(0),
    cost: z.number().min(0).optional(),
    category: z.string().trim().max(255).optional(),
    brand: z.string().trim().max(255).optional(),
  });

  app.post('/api/products', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ManualProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorOrgId = (actor as any)?.orgId as string | undefined;
    const actorIsAdmin = Boolean((actor as any)?.isAdmin);
    if (!actorOrgId && !actorIsAdmin) {
      return res.status(400).json({ error: 'Organization not set for user' });
    }

    const data = parsed.data;
    const priceString = data.price.toFixed(2);
    const costString = typeof data.cost === 'number' ? data.cost.toFixed(2) : undefined;

    const normalizeNullable = (value?: string | null) => {
      if (value == null) return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    };

    const normalizedPayload: Record<string, any> = {
      name: data.name.trim(),
      sku: normalizeNullable(data.sku),
      barcode: normalizeNullable(data.barcode),
      description: normalizeNullable(data.description ?? undefined),
      price: priceString,
      cost: costString,
      category: normalizeNullable(data.category),
      brand: normalizeNullable(data.brand),
      isActive: true,
    } as Partial<typeof products.$inferInsert>;

    if (actorOrgId) {
      normalizedPayload.orgId = actorOrgId;
    }

    try {
      let existing = undefined;
      if (normalizedPayload.sku) {
        existing = await storage.getProductBySku(normalizedPayload.sku);
      }
      if (!existing && normalizedPayload.barcode) {
        existing = await storage.getProductByBarcode(normalizedPayload.barcode);
      }

      if (existing && !actorIsAdmin) {
        const existingOrgId = (existing as any)?.orgId as string | undefined;
        if (existingOrgId && actorOrgId && existingOrgId !== actorOrgId) {
          return res.status(403).json({ error: 'Product belongs to a different organization' });
        }
      }

      let product;
      if (existing) {
        product = await storage.updateProduct(existing.id, normalizedPayload as any);
      } else {
        product = await storage.createProduct(normalizedPayload as any);
      }

      return res.status(201).json(product);
    } catch (error) {
      logger.error('Failed to create or update product', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to save product' });
    }
  });

  const ManualInventorySchema = z.object({
    productId: z.string().uuid(),
    storeId: z.string().uuid(),
    quantity: z.number().int().min(0),
    minStockLevel: z.number().int().min(0).default(0),
    maxStockLevel: z.number().int().min(0).optional(),
  });

  const InventoryAdjustSchema = z.object({
    quantity: z.coerce.number().int().min(1, { message: 'quantity must be at least 1' }),
    reason: z.string().trim().max(200).optional(),
  });

  const DeleteInventorySchema = z.object({
    storeId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  });

  const StockMovementQuerySchema = z.object({
    productId: z.string().uuid().optional(),
    actionType: z.string().trim().max(32).optional(),
    userId: z.string().uuid().optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  const ProductStockHistoryQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
  });

  app.post('/api/inventory', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ManualInventorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { productId, storeId, quantity, minStockLevel, maxStockLevel } = parsed.data;
    const userId = (req.session as any)?.userId as string | undefined;

    try {
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const actor = await storage.getUser(userId);
      if (!actor) {
        return res.status(401).json({ error: 'User not found' });
      }

      const actorIsAdmin = Boolean((actor as any)?.isAdmin);
      const actorStoreId = (actor as any)?.storeId as string | undefined;

      if (!actorIsAdmin) {
        if (!actorStoreId) {
          return res.status(403).json({ error: 'Store assignment required for manager account' });
        }
        if (actorStoreId !== storeId) {
          return res.status(403).json({ error: 'You can only manage inventory for your assigned store' });
        }
      }

      const existing = await storage.getInventoryItem(productId, storeId);
      const payload: Record<string, number> = {
        quantity,
        minStockLevel,
      };
      if (typeof maxStockLevel === 'number') {
        payload.maxStockLevel = maxStockLevel;
      }

      const inventoryRecord = existing
        ? await storage.updateInventory(productId, storeId, payload as any, userId)
        : await storage.createInventory({
            productId,
            storeId,
            quantity,
            minStockLevel,
            maxStockLevel: typeof maxStockLevel === 'number' ? maxStockLevel : undefined,
          } as any, userId);

      const action = existing ? 'update' : 'create';
      const baseContext = extractLogContext(req, {
        userId,
        storeId: actorStoreId ?? storeId,
      });

      securityAuditService.logDataAccessEvent('data_write', baseContext, 'inventory_record', {
        action,
        productId,
        storeId,
        quantityBefore: existing?.quantity ?? null,
        quantityAfter: inventoryRecord.quantity,
        minStockBefore: existing?.minStockLevel ?? null,
        minStockAfter: inventoryRecord.minStockLevel,
        maxStockBefore: existing?.maxStockLevel ?? null,
        maxStockAfter: inventoryRecord.maxStockLevel ?? null,
      });

      logger.info('Inventory record saved', {
        ...baseContext,
        action,
        productId,
        storeId,
      });

      return res.status(existing ? 200 : 201).json({ status: 'success', data: inventoryRecord });
    } catch (error) {
      logger.error('Failed to upsert inventory', {
        productId,
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to save inventory' });
    }
  });

  app.post(
    '/api/inventory/:productId/:storeId/adjust',
    requireAuth,
    enforceIpWhitelist,
    requireManagerWithStore(),
    async (req: Request, res: Response) => {
      const managerStoreId = (req as any).managerStoreId as string | undefined;
      const managerOrgId = (req as any).managerOrgId as string | undefined;
      const userId = req.session?.userId as string | undefined;
      const { productId, storeId } = req.params as { productId?: string; storeId?: string };

      if (!productId || !storeId) {
        return res.status(400).json({ error: 'productId and storeId are required' });
      }

      if (!managerStoreId || storeId !== managerStoreId) {
        return res.status(403).json({ error: 'Managers can only adjust inventory for their assigned store' });
      }

      const parsed = InventoryAdjustSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const [productRow] = await db
        .select({ id: products.id, orgId: products.orgId })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!productRow) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (managerOrgId && productRow.orgId && productRow.orgId !== managerOrgId) {
        return res.status(403).json({ error: 'Product does not belong to your organization' });
      }

      try {
        const updatedInventory = await storage.adjustInventory(
          productId, 
          storeId, 
          parsed.data.quantity,
          userId,
          'manual_adjustment',
          undefined,
          parsed.data.reason
        );

        logger.logInventoryEvent('stock_adjusted', {
          productId,
          storeId,
          quantityChange: parsed.data.quantity,
          userId,
          reason: parsed.data.reason ?? 'manual_import_adjustment',
        });

        return res.json({ inventory: updatedInventory });
      } catch (error) {
        logger.error('Failed to adjust inventory', {
          productId,
          storeId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ error: 'Failed to adjust inventory' });
      }
    }
  );

  app.get('/api/inventory/:productId/:storeId', requireAuth, async (req: Request, res: Response) => {
    const { productId, storeId } = req.params as { productId?: string; storeId?: string };
    const normalizedProductId = String(productId ?? '').trim();
    const normalizedStoreId = String(storeId ?? '').trim();
    if (!normalizedProductId || !normalizedStoreId) {
      return res.status(400).json({ error: 'productId and storeId are required' });
    }

    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorIsAdmin = Boolean((actor as any)?.isAdmin);
    if (!actorIsAdmin) {
      const actorStoreId = (actor as any)?.storeId as string | undefined;
      if (!actorStoreId || actorStoreId !== normalizedStoreId) {
        return res.status(403).json({ error: 'You can only view inventory for your assigned store' });
      }
    }

    const item = await storage.getInventoryItem(normalizedProductId, normalizedStoreId);
    if (!item) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    return res.json(item);
  });

  app.get('/api/stores/:storeId/stock-movements', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as { storeId?: string };
    const normalizedStoreId = String(storeId ?? '').trim();
    if (!normalizedStoreId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorIsAdmin = Boolean((actor as any)?.isAdmin);
    if (!actorIsAdmin) {
      const actorStoreId = (actor as any)?.storeId as string | undefined;
      if (!actorStoreId || actorStoreId !== normalizedStoreId) {
        return res.status(403).json({ error: 'You can only view stock history for your assigned store' });
      }
    }

    const parsedQuery = StockMovementQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsedQuery.error.flatten() });
    }

    const { startDate, endDate, ...rest } = parsedQuery.data;
    const movements = await storage.getStoreStockMovements(normalizedStoreId, {
      ...rest,
      startDate: parseDateString(startDate),
      endDate: parseDateString(endDate),
    });

    return res.json({
      data: movements,
      meta: {
        limit: rest.limit ?? 50,
        offset: rest.offset ?? 0,
        count: movements.length,
      },
    });
  });

  app.get('/api/inventory/:productId/:storeId/history', requireAuth, async (req: Request, res: Response) => {
    const { productId, storeId } = req.params as { productId?: string; storeId?: string };
    const normalizedProductId = String(productId ?? '').trim();
    const normalizedStoreId = String(storeId ?? '').trim();
    if (!normalizedProductId || !normalizedStoreId) {
      return res.status(400).json({ error: 'productId and storeId are required' });
    }

    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorIsAdmin = Boolean((actor as any)?.isAdmin);
    if (!actorIsAdmin) {
      const actorStoreId = (actor as any)?.storeId as string | undefined;
      if (!actorStoreId || actorStoreId !== normalizedStoreId) {
        return res.status(403).json({ error: 'You can only view stock history for your assigned store' });
      }
    }

    const parsedQuery = ProductStockHistoryQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsedQuery.error.flatten() });
    }

    const { limit, startDate, endDate } = parsedQuery.data;
    const movements = await storage.getProductStockHistory(normalizedStoreId, normalizedProductId, {
      limit,
      startDate: parseDateString(startDate),
      endDate: parseDateString(endDate),
    });

    return res.json({
      data: movements,
      meta: {
        limit: limit ?? 100,
        count: movements.length,
      },
    });
  });

  app.delete('/api/inventory/:productId', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const productId = String(req.params?.productId ?? '').trim();
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const parsed = DeleteInventorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { storeId, reason } = parsed.data;
    const userId = (req.session as any)?.userId as string | undefined;

    try {
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const actor = await storage.getUser(userId);
      if (!actor) {
        return res.status(401).json({ error: 'User not found' });
      }

      const actorIsAdmin = Boolean((actor as any)?.isAdmin);
      const actorStoreId = (actor as any)?.storeId as string | undefined;

      if (!actorIsAdmin) {
        if (!actorStoreId) {
          return res.status(403).json({ error: 'Store assignment required for manager account' });
        }
        if (actorStoreId !== storeId) {
          return res.status(403).json({ error: 'You can only manage inventory for your assigned store' });
        }
      }

      const existing = await storage.getInventoryItem(productId, storeId);
      if (!existing) {
        return res.status(404).json({ error: 'Inventory record not found' });
      }

      await storage.deleteInventory(productId, storeId, userId, reason);

      const baseContext = extractLogContext(req, {
        userId,
        storeId: actorStoreId ?? storeId,
      });

      securityAuditService.logDataAccessEvent('data_delete', baseContext, 'inventory_record', {
        action: 'delete',
        productId,
        storeId,
        quantityBefore: existing.quantity,
        minStockBefore: existing.minStockLevel,
        maxStockBefore: existing.maxStockLevel,
        reason,
      });

      logger.warn('Inventory record deleted', {
        ...baseContext,
        productId,
        storeId,
        reason,
      });

      return res.json({ status: 'success' });
    } catch (error) {
      logger.error('Failed to delete inventory', {
        productId,
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to delete inventory' });
    }
  });

  app.get('/api/products/categories', requireAuth, async (_req: Request, res: Response) => {
    const columns = await getProductColumns();
    if (!columns.has('category')) {
      logger.warn('Products categories requested but category column is missing');
      return res.json([]);
    }

    const result = await db.execute(sql`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC`);
    const categories = (result.rows || []).map((row: any) => row.category);
    res.json(categories);
  });

  app.get('/api/products/brands', requireAuth, async (_req: Request, res: Response) => {
    const columns = await getProductColumns();
    if (!columns.has('brand')) {
      logger.warn('Products brands requested but brand column is missing');
      return res.json([]);
    }

    const result = await db.execute(sql`SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand ASC`);
    const brands = (result.rows || []).map((row: any) => row.brand);
    res.json(brands);
  });

  // Integration-test compatible endpoints
  app.put('/api/stores/:storeId/inventory/:productId', requireAuth, async (req: Request, res: Response) => {
    const { storeId, productId } = req.params as any;
    const { quantity } = req.body || {};
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(422).json({ status: 'error', message: 'Quantity must be a non-negative number' });
    }
    const updated = await storage.updateInventory(productId, storeId, { quantity } as any);
    return res.json({ status: 'success', data: updated });
  });

  app.get('/api/stores/:storeId/inventory', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const category = String((req.query as any)?.category || '').trim();
    const lowStock = String((req.query as any)?.lowStock || '').trim();

    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorIsAdmin = Boolean((actor as any)?.isAdmin);
    if (!actorIsAdmin) {
      const actorStoreId = (actor as any)?.storeId as string | undefined;
      if (!actorStoreId) {
        return res.status(403).json({ error: 'Store assignment required for manager account' });
      }
      if (actorStoreId !== storeId) {
        return res.status(403).json({ error: 'You can only view inventory for your assigned store' });
      }
    }

    let items = await storage.getInventoryByStore(storeId);

    if (lowStock === 'true') {
      items = items.filter((i) => (i.quantity || 0) <= (i.minStockLevel || 0));
    }

    if (category) {
      items = items.filter((i) => i.product?.category === category);
    }

    const normalizedItems = items.map((item) => {
      const product = item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            sku: item.product.sku ?? null,
            barcode: item.product.barcode ?? null,
            category: item.product.category ?? null,
            brand: item.product.brand ?? null,
            price: toNumber(item.product.price),
            cost: toNumber((item.product as any)?.cost),
            description: item.product.description ?? null,
            createdAt: toIsoString((item.product as any)?.createdAt),
            updatedAt: toIsoString((item.product as any)?.updatedAt),
          }
        : null;

      const formattedPrice = toNumber(item.formattedPrice);
      const quantity = toNumber(item.quantity);

      return {
        id: item.id,
        productId: item.productId,
        storeId: item.storeId,
        quantity,
        minStockLevel: toNumber(item.minStockLevel),
        maxStockLevel: item.maxStockLevel == null ? null : toNumber(item.maxStockLevel),
        lastRestocked: toIsoString(item.lastRestocked),
        updatedAt: toIsoString(item.updatedAt),
        formattedPrice,
        storeCurrency: item.storeCurrency ?? 'USD',
        stockValue: quantity * formattedPrice,
        product,
      };
    });

    let storeCurrency = normalizedItems[0]?.storeCurrency;
    if (!storeCurrency) {
      const storeRecord = await storage.getStore(storeId);
      storeCurrency = storeRecord?.currency ?? 'USD';
    }
    const totalValue = normalizedItems.reduce((sum, item) => sum + item.stockValue, 0);

    return res.json({
      storeId,
      currency: storeCurrency,
      totalValue,
      totalProducts: normalizedItems.length,
      items: normalizedItems,
    });
  });

  app.get('/api/orgs/:orgId/inventory', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
    const orgId = String((req.params as any)?.orgId ?? '').trim();
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const actor = await storage.getUser(userId);
    if (!actor) {
      return res.status(401).json({ error: 'User not found' });
    }

    const actorOrgId = (actor as any)?.orgId as string | undefined;
    if (!actorOrgId || actorOrgId !== orgId) {
      return res.status(403).json({ error: 'You can only view inventory for your organization' });
    }

    const summary = await storage.getOrganizationInventorySummary(orgId);

    if (!summary.stores.length) {
      return res.status(404).json({ error: 'No stores found for organization' });
    }

    const normalizedSummary = {
      totals: {
        totalProducts: toNumber(summary.totals.totalProducts),
        lowStockCount: toNumber(summary.totals.lowStockCount),
        outOfStockCount: toNumber(summary.totals.outOfStockCount),
        overstockCount: toNumber(summary.totals.overstockCount),
        alertCount: toNumber(summary.totals.alertCount),
        alertBreakdown: {
          LOW_STOCK: toNumber(summary.totals.alertBreakdown.LOW_STOCK),
          OUT_OF_STOCK: toNumber(summary.totals.alertBreakdown.OUT_OF_STOCK),
          OVERSTOCKED: toNumber(summary.totals.alertBreakdown.OVERSTOCKED),
        },
        currencyTotals: summary.totals.currencyTotals.map(({ currency, totalValue }) => ({
          currency,
          totalValue: toNumber(totalValue),
        })),
      },
      stores: summary.stores.map((storeSummary) => ({
        storeId: storeSummary.storeId,
        storeName: storeSummary.storeName,
        currency: storeSummary.currency,
        totalProducts: toNumber(storeSummary.totalProducts),
        lowStockCount: toNumber(storeSummary.lowStockCount),
        outOfStockCount: toNumber(storeSummary.outOfStockCount),
        overstockCount: toNumber(storeSummary.overstockCount),
        totalValue: toNumber(storeSummary.totalValue),
        alertCount: toNumber(storeSummary.alertCount),
        alertBreakdown: {
          LOW_STOCK: toNumber(storeSummary.alertBreakdown.LOW_STOCK),
          OUT_OF_STOCK: toNumber(storeSummary.alertBreakdown.OUT_OF_STOCK),
          OVERSTOCKED: toNumber(storeSummary.alertBreakdown.OVERSTOCKED),
        },
      })),
    };

    return res.json(normalizedSummary);
  });

  app.get('/api/stores/:storeId/alerts', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const alerts = await storage.getLowStockAlerts(storeId);
    res.json(alerts);
  });

  app.put('/api/alerts/:alertId/resolve', requireAuth, async (req: Request, res: Response) => {
    const { alertId } = req.params as any;
    if (!alertId) {
      return res.status(400).json({ error: 'alertId is required' });
    }

    await storage.resolveLowStockAlert(alertId);
    res.json({ status: 'ok' });
  });

  app.get('/api/stores/:storeId/inventory/low-stock', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const items = await storage.getLowStockItems(storeId);
    const withProduct = await Promise.all(items.map(async i => ({ ...i, product: await storage.getProduct(i.productId) })));
    return res.json(withProduct);
  });
  // List products
  app.get('/api/inventory/products', async (_req: Request, res: Response) => {
    const rows = await db.select().from(products).limit(500);
    res.json(rows);
  });

  // Create product
  const ProductSchema = z.object({
    orgId: z.string().uuid(),
    sku: z.string().min(1),
    barcode: z.string().optional(),
    name: z.string().min(1),
    costPrice: z.string(),
    salePrice: z.string(),
    vatRate: z.string().optional(),
  });
  app.post('/api/inventory/products', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    const created = await db.insert(products).values(parsed.data as any).returning();
    res.json(created[0]);
  });

  // CSV template download
  app.get('/api/inventory/template.csv', sensitiveEndpointRateLimit, (_req: Request, res: Response) => {
    const file = path.resolve(process.cwd(), 'scripts/csv-templates/inventory_import_template.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    fs.createReadStream(file).pipe(res);
  });

  // Inventory import (multipart CSV), Zod validation, upsert products, per-store qty, invalid row report
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  const uploadSingle: any = upload.single('file');
  const ImportRowSchema = z.object({
    sku: z.string().min(1),
    barcode: z.string().optional().nullable(),
    name: z.string().min(1),
    cost_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    sale_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    vat_rate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().default('0'),
    reorder_level: z.string().regex(/^\d+$/).optional().default('0'),
    min_stock_level: z.string().regex(/^\d+$/).optional().default('0'),
    max_stock_level: z.string().regex(/^\d+$/).optional().default('0'),
    initial_quantity: z.string().regex(/^\d+$/).optional().default('0'),
    store_id: z.string().uuid().optional(),
    store_code: z.string().optional(),
  });

  const InventoryImportModeSchema = z.enum(['overwrite', 'regularize']);

  app.post(
    '/api/inventory/import',
    requireAuth,
    enforceIpWhitelist,
    requireManagerWithStore(),
    sensitiveEndpointRateLimit,
    uploadSingle,
    async (req: Request, res: Response) => {
    const uploaded = (req as any).file as { buffer: Buffer; originalname?: string } | undefined;
    if (!uploaded) return res.status(400).json({ error: 'file is required' });

    const modeInput = typeof req.body?.mode === 'string' ? req.body.mode.toLowerCase() : '';
    const parsedMode = InventoryImportModeSchema.safeParse(modeInput);
    if (!parsedMode.success) {
      return res.status(400).json({ error: 'mode must be either overwrite or regularize' });
    }
    const mode = parsedMode.data;

    const bodyStoreId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';
    const selectedStoreId = bodyStoreId.length ? bodyStoreId : undefined;
    const managerStoreId = (req as any).managerStoreId as string | undefined;
    const managerOrgId = (req as any).managerOrgId as string | undefined;

    if (selectedStoreId && managerStoreId && selectedStoreId !== managerStoreId) {
      return res.status(403).json({ error: 'You can only import inventory into your assigned store' });
    }

    const fallbackStoreId = selectedStoreId ?? managerStoreId;
    if (!fallbackStoreId) {
      return res.status(403).json({ error: 'Store assignment required to import inventory' });
    }

    const userId = (req.session as any)?.userId as string | undefined;
    let orgId: string | undefined = managerOrgId;
    if (!orgId && userId) {
      const r = await db.select({ orgId: users.orgId }).from(users).where(eq(users.id, userId));
      orgId = r[0]?.orgId as string | undefined;
    }
    if (!orgId) {
      return res.status(400).json({ error: 'Organization could not be resolved for user' });
    }

    const text = uploaded.buffer.toString('utf-8');
    const records: any[] = [];
    await new Promise<void>((resolve, reject) => {
      csvParse(text, { columns: true, trim: true }, (err: any, out: any[]) => {
        if (err) return reject(err);
        records.push(...out);
        resolve();
      });
    });

    const invalidRows: Array<{ row: any; error: string }> = [];
    const results: any[] = [];
    const alertSyncTargets = new Set<string>();
    let addedProducts = 0;
    let stockAdjusted = 0;
    let zeroQuantityRows = 0;

    const fileName = uploaded.originalname || 'inventory_import.csv';
    const [job] = await db
      .insert(importJobs)
      .values({
        userId: userId ?? managerStoreId ?? 'unknown-user',
        orgId,
        storeId: fallbackStoreId,
        type: 'inventory',
        status: 'processing',
        fileName,
        mode,
        totalRows: records.length,
      } as any)
      .returning();
    const importBatchId = job?.id as string | undefined;

    const client = (db as any).client;
    const pg = await client.connect();
    try {
      await pg.query('BEGIN');

      for (const raw of records) {
        const parsed = ImportRowSchema.safeParse({
          sku: raw.sku,
          barcode: raw.barcode || null,
          name: raw.name,
          cost_price: raw.cost_price || raw.costPrice,
          sale_price: raw.sale_price || raw.salePrice,
          vat_rate: raw.vat_rate || raw.vatRate || '0',
          reorder_level: raw.reorder_level || raw.reorderLevel || '0',
          min_stock_level: raw.min_stock_level || raw.minStockLevel || raw.reorder_level || raw.reorderLevel || '0',
          max_stock_level: raw.max_stock_level || raw.maxStockLevel || '0',
          initial_quantity: raw.initial_quantity || raw.initialQuantity || '0',
          store_id: raw.store_id || raw.storeId,
          store_code: raw.store_code,
        });
        if (!parsed.success) {
          invalidRows.push({ row: raw, error: parsed.error.errors.map((e) => e.message).join('; ') });
          continue;
        }
        const r = parsed.data;

        // Resolve storeId
        let storeId: string | undefined = r.store_id as any;
        if (!storeId && r.store_code) {
          const sr = await db
            .select()
            .from(stores)
            .where(and(eq(stores.orgId as any, orgId as any), eq(stores.name as any, r.store_code)))
            .limit(1);
          storeId = (sr as any)[0]?.id;
        }
        if (!storeId) {
          storeId = fallbackStoreId;
        }
        if (!storeId) {
          invalidRows.push({ row: raw, error: 'store_id or valid store_code required' });
          continue;
        }
        if (managerStoreId && storeId !== managerStoreId) {
          invalidRows.push({ row: raw, error: 'Managers can only import inventory into their assigned store' });
          continue;
        }

        // Upsert product by (orgId, sku)
        const existing = await db
          .select()
          .from(products)
          .where(and(eq(products.orgId as any, orgId as any), eq(products.sku as any, r.sku)))
          .limit(1);
        let productId: string;
        if ((existing as any)[0]) {
          const p = (existing as any)[0];
          await db.execute(sql`UPDATE products SET barcode = ${r.barcode}, name = ${r.name}, cost_price = ${r.cost_price}, sale_price = ${r.sale_price}, vat_rate = ${r.vat_rate}, price = ${r.sale_price}
            WHERE id = ${p.id}`);
          productId = p.id;
        } else {
          const inserted = await db.execute(sql`INSERT INTO products (org_id, sku, barcode, name, cost_price, sale_price, vat_rate, price)
             VALUES (${orgId}, ${r.sku}, ${r.barcode}, ${r.name}, ${r.cost_price}, ${r.sale_price}, ${r.vat_rate}, ${r.sale_price}) RETURNING id`);
          productId = (inserted as any).rows[0].id;
          addedProducts += 1;
        }

        const quantityDelta = Number(r.initial_quantity);
        const minStockLevel = Number(r.min_stock_level ?? r.reorder_level ?? '0');
        const maxStockLevel = Number(r.max_stock_level ?? '0');
        const reorderLevel = Number(r.reorder_level ?? r.min_stock_level ?? '0');

        if (!Number.isFinite(quantityDelta)) {
          invalidRows.push({ row: raw, error: 'initial_quantity must be numeric' });
          continue;
        }
        if (quantityDelta < 0) {
          invalidRows.push({ row: raw, error: 'initial_quantity cannot be negative' });
          continue;
        }
        if (!Number.isFinite(minStockLevel) || minStockLevel < 0) {
          invalidRows.push({ row: raw, error: 'min_stock_level must be a non-negative number' });
          continue;
        }
        if (!Number.isFinite(maxStockLevel) || maxStockLevel < 0) {
          invalidRows.push({ row: raw, error: 'max_stock_level must be a non-negative number' });
          continue;
        }
        if (maxStockLevel > 0 && maxStockLevel < minStockLevel) {
          invalidRows.push({ row: raw, error: 'max_stock_level must be greater than or equal to min_stock_level' });
          continue;
        }

        if (quantityDelta === 0) {
          zeroQuantityRows += 1;
        }

        if (mode === 'overwrite') {
          // Get existing quantity for movement tracking
          const existingCheck = await db.execute(
            sql`SELECT quantity FROM inventory WHERE store_id = ${storeId} AND product_id = ${productId} LIMIT 1`
          );
          const existingRow = Array.isArray((existingCheck as any).rows)
            ? (existingCheck as any).rows[0]
            : (existingCheck as any)[0];
          const quantityBefore = existingRow?.quantity ?? 0;

          await db.execute(sql`INSERT INTO inventory (store_id, product_id, quantity, reorder_level, min_stock_level, max_stock_level)
             VALUES (${storeId}, ${productId}, ${quantityDelta}, ${reorderLevel}, ${minStockLevel}, ${maxStockLevel})
             ON CONFLICT (store_id, product_id)
             DO UPDATE SET quantity = EXCLUDED.quantity,
               reorder_level = EXCLUDED.reorder_level,
               min_stock_level = EXCLUDED.min_stock_level,
               max_stock_level = EXCLUDED.max_stock_level`);

          // Record stock movement via storage helper
          if (quantityBefore !== quantityDelta) {
            await storage.logStockMovement({
              storeId,
              productId,
              quantityBefore,
              quantityAfter: quantityDelta,
              actionType: 'import',
              source: 'csv_import',
              referenceId: importBatchId,
              userId,
              notes: `Import overwrite from ${fileName}`,
              metadata: { mode, quantityDelta },
            });
          }
          stockAdjusted += 1;
        } else {
          const existingInventory = await db.execute(
            sql`SELECT quantity FROM inventory WHERE store_id = ${storeId} AND product_id = ${productId} LIMIT 1`
          );
          const existingRow = Array.isArray((existingInventory as any).rows)
            ? (existingInventory as any).rows[0]
            : (existingInventory as any)[0];

          if (existingRow && typeof existingRow.quantity === 'number') {
            const currentQuantity = existingRow.quantity;
            const newQuantity = currentQuantity + quantityDelta;
            await db.execute(sql`UPDATE inventory SET quantity = ${newQuantity}, reorder_level = ${reorderLevel}, min_stock_level = ${minStockLevel}, max_stock_level = ${maxStockLevel}
               WHERE store_id = ${storeId} AND product_id = ${productId}`);

            if (quantityDelta !== 0) {
              await storage.logStockMovement({
                storeId,
                productId,
                quantityBefore: currentQuantity,
                quantityAfter: newQuantity,
                actionType: 'import',
                source: 'csv_import',
                referenceId: importBatchId,
                userId,
                notes: `Import regularize from ${fileName}`,
                metadata: { mode, quantityDelta },
              });
            }
            stockAdjusted += 1;
          } else {
            await db.execute(sql`INSERT INTO inventory (store_id, product_id, quantity, reorder_level, min_stock_level, max_stock_level)
               VALUES (${storeId}, ${productId}, ${quantityDelta}, ${reorderLevel}, ${minStockLevel}, ${maxStockLevel})`);

            if (quantityDelta !== 0) {
              await storage.logStockMovement({
                storeId,
                productId,
                quantityBefore: 0,
                quantityAfter: quantityDelta,
                actionType: 'import',
                source: 'csv_import',
                referenceId: importBatchId,
                userId,
                notes: `Import new from ${fileName}`,
                metadata: { mode, quantityDelta },
              });
            }
            stockAdjusted += 1;
          }
        }
        alertSyncTargets.add(`${storeId}:${productId}`);

        results.push({ sku: r.sku, productId, storeId, mode });
      }
      await pg.query('COMMIT');
    } catch (error) {
      try {
        await pg.query('ROLLBACK');
      } catch (rollbackError) {
        logger.warn('Inventory import rollback failed', {
          error: rollbackError instanceof Error ? error.message : String(rollbackError),
        });
      }
      logger.error('Failed to import inventory', {
        userId: req.session?.userId,
        invalidRowCount: invalidRows.length,
        error: error instanceof Error ? error.message : String(error),
      });

      if (importBatchId) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await db
          .update(importJobs)
          .set({
            status: 'failed',
            errorMessage,
            processedRows: results.length,
            errorCount: invalidRows.length,
            invalidCount: invalidRows.length,
            skippedCount: zeroQuantityRows,
            completedAt: new Date(),
            details: invalidRows.length ? ({ invalidRows: invalidRows.slice(0, 50) } as any) : null,
          } as any)
          .where(eq(importJobs.id, importBatchId));
      }

      return res.status(500).json({ error: 'Failed to import inventory' });
    } finally {
      pg.release();
    }

    for (const key of alertSyncTargets) {
      const [syncStoreId, syncProductId] = key.split(':');
      try {
        await storage.syncLowStockAlertState(syncStoreId, syncProductId);
      } catch (error) {
        logger.warn('Failed to sync low stock alert state after import', {
          storeId: syncStoreId,
          productId: syncProductId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (importBatchId) {
      const completionStatus = invalidRows.length ? 'completed_with_errors' : 'completed';
      await db
        .update(importJobs)
        .set({
          status: completionStatus,
          processedRows: results.length,
          errorCount: invalidRows.length,
          invalidCount: invalidRows.length,
          skippedCount: zeroQuantityRows,
          completedAt: new Date(),
          details: invalidRows.length ? ({ invalidRows: invalidRows.slice(0, 50) } as any) : null,
        } as any)
        .where(eq(importJobs.id, importBatchId));
    }

    res.status(200).json({
      mode,
      imported: results.length,
      invalid: invalidRows.length,
      invalidRows,
      addedProducts,
      stockAdjusted,
      skipped: zeroQuantityRows,
      zeroQuantityRows,
    });
  }
  );
}


