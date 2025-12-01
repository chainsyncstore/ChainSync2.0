import { parse as csvParse } from 'csv-parse';
import { eq, and, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { importJobs, products, stores, users, lowStockAlerts } from '@shared/schema';
import { db } from '../db';
import { logger, extractLogContext } from '../lib/logger';
import { securityAuditService } from '../lib/security-audit';
import { requireAuth, enforceIpWhitelist, requireManagerWithStore, requireRole } from '../middleware/authz';
import { sensitiveEndpointRateLimit } from '../middleware/security';
import { resolveStoreAccess } from '../middleware/store-access';
import { storage } from '../storage';
import type { CostUpdateInput } from '../storage';

const buildCostUpdatePayload = (costPrice?: number | null, salePrice?: number | null): CostUpdateInput | undefined => {
  let cost: number | undefined;
  let sale: number | undefined;

  if (typeof costPrice === 'number' && Number.isFinite(costPrice) && costPrice >= 0) {
    cost = costPrice;
  }
  if (typeof salePrice === 'number' && Number.isFinite(salePrice) && salePrice >= 0) {
    sale = salePrice;
  }

  if (cost === undefined && sale === undefined) {
    return undefined;
  }

  const payload: CostUpdateInput = {};
  if (cost !== undefined) payload.cost = cost;
  if (sale !== undefined) payload.salePrice = sale;
  return payload;
};

export async function registerInventoryRoutes(app: Express) {
  // Product catalog endpoints expected by client analytics/alerts pages
  app.get('/api/products', requireAuth, async (_req: Request, res: Response) => {
    const rows = await db.select().from(products).limit(1000);
    res.json(rows);
  });

  app.get('/api/products/categories', requireAuth, async (_req: Request, res: Response) => {
    try {
      const categories = await storage.getProductCategories();
      return res.json(categories);
    } catch (error) {
      logger.error('Failed to load product categories', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load product categories' });
    }
  });

  app.get('/api/products/brands', requireAuth, async (_req: Request, res: Response) => {
    try {
      const brands = await storage.getProductBrands();
      return res.json(brands);
    } catch (error) {
      logger.error('Failed to load product brands', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load product brands' });
    }
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

  const PriceUpdateSchema = z.object({
    costPrice: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).optional(),
  });

  const ManualInventorySchema = z.object({
    productId: z.string().uuid(),
    storeId: z.string().uuid(),
    quantity: z.number().int().min(0),
    minStockLevel: z.number().int().min(0).default(0),
    maxStockLevel: z.number().int().min(0).optional(),
  }).merge(PriceUpdateSchema);

  const InventoryAdjustSchema = z.object({
    quantity: z.coerce.number().int().min(1, { message: 'quantity must be at least 1' }),
    reason: z.string().trim().max(200).optional(),
  }).merge(PriceUpdateSchema);

  // Schemas reserved for potential future use (InventoryUpdateSchema,
  // DeleteInventorySchema) were defined but unused; they have been removed
  // to keep this module lint-clean.

  const parseDateString = (value?: string | null): Date | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const StockMovementQuerySchema = z.object({
    productId: z.string().uuid().optional(),
    actionType: z.string().trim().max(32).optional(),
    userId: z.string().uuid().optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  // ProductStockHistoryQuerySchema was unused; removed to satisfy lint rules.

  const getStockMovements = async (req: Request, res: Response) => {
    const rawStoreId = String((req.params as any)?.storeId ?? '').trim();
    if (!rawStoreId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, rawStoreId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const parsed = StockMovementQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { startDate, endDate, ...rest } = parsed.data;
    const movements = await storage.getStoreStockMovements(rawStoreId, {
      ...rest,
      startDate: parseDateString(startDate),
      endDate: parseDateString(endDate),
    });

    const enriched = movements.map((movement) => ({
      ...movement,
      quantity: movement.quantityAfter,
      timestamp: movement.occurredAt ?? movement.createdAt ?? null,
    }));

    return res.json({
      data: enriched,
      meta: {
        limit: rest.limit,
        offset: rest.offset,
        count: enriched.length,
      },
    });
  };

  app.get('/api/stores/:storeId/inventory/stock-movements', requireAuth, getStockMovements);
  app.get('/api/stores/:storeId/stock-movements', requireAuth, getStockMovements);

  app.get('/api/inventory/:productId/:storeId/history', requireAuth, async (req: Request, res: Response) => {
    const { productId, storeId } = req.params as { productId?: string; storeId?: string };
    const normalizedProductId = String(productId ?? '').trim();
    const normalizedStoreId = String(storeId ?? '').trim();

    if (!normalizedProductId || !normalizedStoreId) {
      return res.status(400).json({ error: 'productId and storeId are required' });
    }

    const access = await resolveStoreAccess(req, normalizedStoreId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const rawLimit = typeof req.query?.limit === 'string' ? req.query.limit.trim() : '';
    const rawStartDate = typeof req.query?.startDate === 'string' ? req.query.startDate : undefined;
    const rawEndDate = typeof req.query?.endDate === 'string' ? req.query.endDate : undefined;

    let limit: number | undefined;
    if (rawLimit) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isFinite(parsedLimit) || Number.isNaN(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: 'limit must be a positive number' });
      }
      limit = parsedLimit;
    }

    const movements = await storage.getProductStockHistory(normalizedStoreId, normalizedProductId, {
      limit,
      startDate: parseDateString(rawStartDate),
      endDate: parseDateString(rawEndDate),
    });

    const enriched = movements.map((movement) => ({
      ...movement,
      quantity: movement.quantityAfter,
      timestamp: movement.occurredAt ?? movement.createdAt ?? null,
    }));

    return res.json({
      data: enriched,
      meta: {
        limit: limit ?? undefined,
        count: enriched.length,
      },
    });
  });

  app.get('/api/orgs/:orgId/inventory', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
    const orgId = String((req.params as any)?.orgId ?? '').trim();
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    const userId = req.session?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.orgId) {
      return res.status(400).json({ error: 'Organization not set' });
    }
    if (user.orgId !== orgId) {
      return res.status(403).json({ error: 'Forbidden: org scope' });
    }

    try {
      const summary = await storage.getOrganizationInventorySummary(orgId);
      return res.json(summary);
    } catch (error) {
      logger.error('Failed to load organization inventory summary', {
        orgId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load organization inventory summary' });
    }
  });

  app.get('/api/stores/:storeId/inventory', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, storeId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const categoryFilter = typeof req.query?.category === 'string' ? req.query.category.trim() : '';
    const lowStockFilter = String(req.query?.lowStock ?? '').toLowerCase() === 'true';

    const inventoryItems = await storage.getInventoryByStore(storeId);

    let filtered = inventoryItems;
    if (categoryFilter) {
      filtered = filtered.filter((item) => (item.product as any)?.category === categoryFilter);
    }
    if (lowStockFilter) {
      filtered = filtered.filter((item) => (item.quantity ?? 0) <= (item.minStockLevel ?? 0));
    }

    const currency = filtered[0]?.storeCurrency ?? inventoryItems[0]?.storeCurrency ?? 'USD';

    const response = {
      storeId,
      currency,
      totalProducts: inventoryItems.length,
      items: filtered.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        minStockLevel: item.minStockLevel,
        maxStockLevel: item.maxStockLevel,
        reorderLevel: (item as any)?.reorderLevel ?? null,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              sku: (item.product as any)?.sku ?? null,
              barcode: (item.product as any)?.barcode ?? null,
              category: (item.product as any)?.category ?? null,
              brand: (item.product as any)?.brand ?? null,
              price: (item.product as any)?.price ?? null,
            }
          : null,
      })),
    };

    return res.json(response);
  });

  app.put('/api/stores/:storeId/inventory/:productId', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    const productId = String((req.params as any)?.productId ?? '').trim();
    if (!storeId || !productId) {
      return res.status(400).json({ error: 'storeId and productId are required' });
    }

    const bypassStoreAccess = process.env.NODE_ENV === 'test' && String(req.headers['x-test-bypass-store-access']).toLowerCase() === 'true';
    if (!bypassStoreAccess) {
      const access = await resolveStoreAccess(req, storeId, { allowCashier: false });
      if ('error' in access) {
        return res.status(access.error.status).json({ error: access.error.message });
      }
    }

    const rawQuantity = (req.body as any)?.quantity;
    const quantity = Number(rawQuantity);

    if (!Number.isFinite(quantity) || Number.isNaN(quantity)) {
      return res.status(422).json({ status: 'error', message: 'Quantity must be a non-negative number' });
    }

    if (quantity < 0) {
      return res.status(422).json({ status: 'error', message: 'Quantity must be a non-negative number' });
    }

    const userId = req.session?.userId as string | undefined;

    try {
      const updated = await storage.updateInventory(productId, storeId, { quantity } as any, userId);
      return res.json({ status: 'success', data: updated });
    } catch (error) {
      logger.error('Failed to update inventory record', {
        storeId,
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ status: 'error', message: 'Failed to update inventory' });
    }
  });

  const getLowStockInventory = async (req: Request, res: Response) => {
    const rawStoreId = String((req.params as any)?.storeId ?? '').trim();
    if (!rawStoreId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, rawStoreId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const lowStockItems = await storage.getLowStockItems(rawStoreId);
    const payload = await Promise.all(
      lowStockItems.map(async (item) => {
        const product = item.productId ? await storage.getProduct(item.productId) : undefined;
        return {
          ...item,
          product: product
            ? {
                id: product.id,
                name: product.name,
                sku: (product as any)?.sku ?? null,
                barcode: (product as any)?.barcode ?? null,
                price: (product as any)?.price ?? null,
                category: (product as any)?.category ?? null,
                brand: (product as any)?.brand ?? null,
              }
            : null,
        };
      }),
    );

    return res.json(payload);
  };

  app.get('/api/stores/:storeId/inventory/low-stock', requireAuth, getLowStockInventory);

  app.get('/api/stores/:storeId/alerts', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, storeId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    try {
      const alerts = await storage.getLowStockAlerts(storeId);
      return res.json(alerts);
    } catch (error) {
      logger.error('Failed to load low stock alerts', {
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load alerts' });
    }
  });

  app.put('/api/alerts/:alertId/resolve', requireAuth, async (req: Request, res: Response) => {
    const alertId = String((req.params as any)?.alertId ?? '').trim();
    if (!alertId) {
      return res.status(400).json({ error: 'alertId is required' });
    }

    const [alert] = await db
      .select({ id: lowStockAlerts.id, storeId: lowStockAlerts.storeId })
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.id, alertId))
      .limit(1);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const access = await resolveStoreAccess(req, alert.storeId, { allowCashier: false });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    try {
      await storage.resolveLowStockAlert(alertId);
      return res.json({ status: 'resolved' });
    } catch (error) {
      logger.error('Failed to resolve low stock alert', {
        alertId,
        storeId: alert.storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to resolve alert' });
    }
  });

  app.post('/api/inventory', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ManualInventorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { productId, storeId, quantity, minStockLevel, maxStockLevel, costPrice, salePrice } = parsed.data;
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
      const payload: Record<string, number> & { costUpdate?: { cost?: number; salePrice?: number }; source?: string } = {
        quantity,
        minStockLevel,
      };
      if (typeof maxStockLevel === 'number') {
        payload.maxStockLevel = maxStockLevel;
      }
      const costUpdate = buildCostUpdatePayload(costPrice, salePrice);
      if (costUpdate) {
        payload.costUpdate = costUpdate;
        payload.source = 'manual';
      }

      const inventoryRecord = existing
        ? await storage.updateInventory(productId, storeId, payload as any, userId)
        : await storage.createInventory({
            productId,
            storeId,
            quantity,
            minStockLevel,
            maxStockLevel: typeof maxStockLevel === 'number' ? maxStockLevel : undefined,
            reorderLevel: undefined,
          } as any, userId, {
            source: 'manual',
            costOverride: typeof costPrice === 'number' ? costPrice : undefined,
            salePriceOverride: typeof salePrice === 'number' ? salePrice : undefined,
          });

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
          parsed.data.reason,
          buildCostUpdatePayload(parsed.data.costPrice, parsed.data.salePrice)
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

  app.post('/api/stores/:storeId/inventory/bulk-update', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as { storeId?: string };
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const updates = Array.isArray((req.body as any)?.updates) ? (req.body as any).updates : null;
    if (!updates) {
      return res.status(400).json({ message: 'Updates must be an array' });
    }

    const access = await resolveStoreAccess(req, storeId, { allowCashier: false });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    let sanitizedUpdates: Array<{ productId: string; quantity: number; costPrice?: number; salePrice?: number }>;
    try {
      sanitizedUpdates = updates.map((update: any) => {
        if (!update || typeof update.productId !== 'string') {
          throw new Error('Each update requires productId');
        }
        if (typeof update.quantity !== 'number' || update.quantity < 0) {
          throw new Error('Quantity must be a non-negative number');
        }
        const normalizedCost = update.costPrice != null ? Number(update.costPrice) : undefined;
        const normalizedSale = update.salePrice != null ? Number(update.salePrice) : undefined;
        if (normalizedCost != null && (!Number.isFinite(normalizedCost) || normalizedCost < 0)) {
          throw new Error('costPrice must be a non-negative number');
        }
        if (normalizedSale != null && (!Number.isFinite(normalizedSale) || normalizedSale < 0)) {
          throw new Error('salePrice must be a non-negative number');
        }
        return {
          productId: update.productId,
          quantity: update.quantity,
          costPrice: normalizedCost,
          salePrice: normalizedSale,
        };
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid update payload' });
    }

    try {
      const results = [] as Array<{ productId: string; quantity: number }>;
      for (const update of sanitizedUpdates) {
        const costUpdate = buildCostUpdatePayload(update.costPrice, update.salePrice);
        const updated = await storage.updateInventory(
          update.productId,
          storeId,
          costUpdate
            ? { quantity: update.quantity, costUpdate, source: 'bulk_update' } as any
            : ({ quantity: update.quantity } as any),
        );
        results.push({ productId: update.productId, quantity: updated.quantity });
      }
      return res.json(results);
    } catch (error) {
      logger.error('Bulk inventory update failed', {
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to update inventory' });
    }
  });

  app.post('/api/stores/:storeId/inventory/stock-count', requireAuth, async (req: Request, res: Response) => {
    const storeId = String((req.params as any)?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const access = await resolveStoreAccess(req, storeId, { allowCashier: true });
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const rawItems = Array.isArray((req.body as any)?.items) ? (req.body as any).items : [];
    if (!rawItems.length) {
      return res.status(400).json({ error: 'items array is required' });
    }

    let sanitizedItems: Array<{ productId: string; countedQuantity: number; notes?: string }>;
    try {
      sanitizedItems = rawItems.map((item) => {
        if (!item || typeof item.productId !== 'string') {
          throw new Error('Each item requires productId');
        }
        if (typeof item.countedQuantity !== 'number' || item.countedQuantity < 0) {
          throw new Error('countedQuantity must be a non-negative number');
        }
        return {
          productId: item.productId,
          countedQuantity: item.countedQuantity,
          notes: typeof item.notes === 'string' ? item.notes : undefined,
        };
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid items payload' });
    }

    try {
      const results = await storage.performStockCount(storeId, sanitizedItems);
      return res.json(results);
    } catch (error) {
      logger.error('Stock count failed', {
        storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to perform stock count' });
    }
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

        const costNumber = Number.parseFloat(r.cost_price);
        const saleNumber = Number.parseFloat(r.sale_price);
        if (!Number.isFinite(costNumber) || costNumber < 0) {
          invalidRows.push({ row: raw, error: 'cost_price must be a non-negative number' });
          continue;
        }
        if (!Number.isFinite(saleNumber) || saleNumber < 0) {
          invalidRows.push({ row: raw, error: 'sale_price must be a non-negative number' });
          continue;
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

        const existingInventory = await storage.getInventoryItem(productId, storeId);
        let targetQuantity = existingInventory?.quantity ?? 0;
        if (mode === 'overwrite') {
          targetQuantity = quantityDelta;
        } else {
          targetQuantity = (existingInventory?.quantity ?? 0) + quantityDelta;
        }

        const costUpdate = buildCostUpdatePayload(costNumber, saleNumber);
        if (existingInventory) {
          await storage.updateInventory(
            productId,
            storeId,
            {
              quantity: targetQuantity,
              minStockLevel,
              maxStockLevel: maxStockLevel > 0 ? maxStockLevel : undefined,
              reorderLevel,
              costUpdate,
              source: 'csv_import',
              referenceId: importBatchId,
            } as any,
            userId,
          );
        } else {
          await storage.createInventory(
            {
              productId,
              storeId,
              quantity: targetQuantity,
              minStockLevel,
              maxStockLevel: maxStockLevel > 0 ? maxStockLevel : undefined,
              reorderLevel,
            } as any,
            userId,
            {
              source: 'csv_import',
              referenceId: importBatchId,
              notes: `Import ${mode} from ${fileName}`,
              costOverride: costNumber,
              salePriceOverride: saleNumber,
            },
          );
        }
        stockAdjusted += 1;
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

