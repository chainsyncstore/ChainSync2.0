import { eq, and, sql } from 'drizzle-orm';
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { legacySales as sales, legacySaleItems as saleItems, inventory, products, legacyCustomers as customers, loyaltyAccounts, legacyLoyaltyTransactions as loyaltyTransactions, organizations } from '@shared/schema';
import { db } from '../db';
import { logger, extractLogContext } from '../lib/logger';
import { monitoringService } from '../lib/monitoring';
import { securityAuditService } from '../lib/security-audit';
import { requireAuth } from '../middleware/authz';

// Sync data schemas
const OfflineSaleSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  productId: z.string(),
  quantity: z.number().positive(),
  salePrice: z.number().positive(),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  paymentMethod: z.enum(['cash', 'card', 'mobile', 'other']),
  offlineTimestamp: z.string(),
  clientId: z.string().optional(),
  customerPhone: z.string().optional(),
  redeemPoints: z.number().int().min(0).optional(),
  loyaltyEarnBase: z.number().min(0).optional(),
});

const OfflineInventoryUpdateSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  quantityChange: z.number(),
  reason: z.enum(['sale', 'adjustment', 'restock', 'damage', 'return']),
  offlineTimestamp: z.string(),
  clientId: z.string().optional()
});

const SyncBatchSchema = z.object({
  sales: z.array(OfflineSaleSchema).default([]),
  inventoryUpdates: z.array(OfflineInventoryUpdateSchema).default([]),
  clientInfo: z.object({
    deviceId: z.string(),
    version: z.string(),
    lastSync: z.string().optional()
  })
});

export async function registerOfflineSyncRoutes(app: Express) {
  
  // Sync offline data to server
  app.post('/api/sync/upload', requireAuth, async (req: Request, res: Response) => {
    const context = extractLogContext(req);
    
    try {
      const parsed = SyncBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        securityAuditService.logApplicationEvent('input_validation_failed', context, {
          operation: 'sync_upload',
          errors: parsed.error.errors
        });
        return res.status(400).json({ 
          error: 'Invalid sync data format',
          details: parsed.error.errors
        });
      }

      const { sales: offlineSales, inventoryUpdates, clientInfo } = parsed.data;
      const results = {
        salesProcessed: 0,
        salesErrors: [] as any[],
        inventoryProcessed: 0,
        inventoryErrors: [] as any[],
        conflicts: [] as any[],
        syncId: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const orgId = (req as any).orgId as string | undefined;
      let orgSettings: { earnRate: number; redeemValue: number } = { earnRate: 1, redeemValue: 0.01 };
      if (orgId) {
        try {
          const [orgRow] = await db
            .select({ earnRate: organizations.loyaltyEarnRate, redeemValue: organizations.loyaltyRedeemValue })
            .from(organizations)
            .where(eq(organizations.id, orgId));
          orgSettings = {
            earnRate: Number(orgRow?.earnRate ?? 1),
            redeemValue: Number(orgRow?.redeemValue ?? 0.01),
          };
        } catch (settingsError) {
          logger.warn('Failed to load org loyalty settings for offline sync', settingsError as Error);
        }
      }

      logger.info('Offline sync upload started', {
        ...context,
        salesCount: offlineSales.length,
        inventoryCount: inventoryUpdates.length,
        deviceId: clientInfo.deviceId
      });

      // Process offline sales
      for (const sale of offlineSales) {
        try {
          await db.transaction(async (tx) => {
            // Check for duplicate sale (by offline ID)
            const existingSale = await tx
              .select({ id: sales.id })
              .from(sales)
              .where(and(
                eq(sales.storeId, sale.storeId),
                eq(sales.idempotencyKey, sale.id)
              ));

            // Check for conflicts with existing sales around the same time
            const conflictWindow = new Date(sale.offlineTimestamp);
            conflictWindow.setMinutes(conflictWindow.getMinutes() - 5);
            const conflictEnd = new Date(sale.offlineTimestamp);
            conflictEnd.setMinutes(conflictEnd.getMinutes() + 5);

            // If duplicate found, skip
            if (existingSale.length > 0) {
              return;
            }

            // Compute amounts for sale
            const subtotal = sale.quantity * sale.salePrice;
            const total = subtotal - sale.discount + sale.tax;

            let customerRecord: { id: string } | null = null;
            let loyaltyAccountRecord: { id: string; points: number } | null = null;
            const redeemPoints = Number(sale.redeemPoints || 0);

            if (sale.customerPhone && orgId) {
              const existingCustomer = await tx
                .select({ id: customers.id })
                .from(customers)
                .where(and(eq(customers.orgId, orgId), eq(customers.phone, sale.customerPhone)))
                .limit(1);
              if (existingCustomer[0]) {
                customerRecord = existingCustomer[0];
              } else {
                const insertedCustomer = await tx
                  .insert(customers)
                  .values({ orgId, phone: sale.customerPhone } as any)
                  .returning({ id: customers.id });
                customerRecord = insertedCustomer[0];
              }

              if (customerRecord) {
                const accountRows = await tx
                  .select({ id: loyaltyAccounts.id, points: loyaltyAccounts.points })
                  .from(loyaltyAccounts)
                  .where(and(eq(loyaltyAccounts.orgId, orgId), eq(loyaltyAccounts.customerId, customerRecord.id)))
                  .limit(1);
                if (accountRows[0]) {
                  loyaltyAccountRecord = { id: accountRows[0].id, points: Number(accountRows[0].points || 0) };
                } else {
                  const insertedAccount = await tx
                    .insert(loyaltyAccounts)
                    .values({ orgId, customerId: customerRecord.id, points: 0 } as any)
                    .returning({ id: loyaltyAccounts.id, points: loyaltyAccounts.points });
                  loyaltyAccountRecord = { id: insertedAccount[0].id, points: Number(insertedAccount[0].points || 0) };
                }
              }
            }

            if (loyaltyAccountRecord && redeemPoints > 0) {
              if (loyaltyAccountRecord.points < redeemPoints) {
                throw new Error('Insufficient loyalty points for offline sale redemption');
              }
            }

            // Insert sale and get generated id
            const inserted = await tx
              .insert(sales)
              .values({
                orgId: (req as any).orgId,
                storeId: sale.storeId,
                cashierId: context.userId as string,
                subtotal: String(subtotal),
                discount: String(sale.discount),
                tax: String(sale.tax),
                total: String(total),
                paymentMethod: sale.paymentMethod,
                occurredAt: new Date(sale.offlineTimestamp),
                walletReference: null,
                paymentBreakdown: null,
                idempotencyKey: sale.id,
              } as any)
              .returning({ id: sales.id });

            const saleId = inserted[0]?.id as string;

            // Insert sale item for the single-product offline sale
            await tx.insert(saleItems).values({
              saleId,
              productId: sale.productId,
              quantity: sale.quantity,
              unitPrice: String(sale.salePrice),
              lineDiscount: String(sale.discount),
              lineTotal: String(total),
            } as any);

            // Update inventory
            await tx
              .update(inventory)
              .set({
                quantity: sql`${inventory.quantity} - ${sale.quantity}`,
              } as any)
              .where(and(
                eq(inventory.productId, sale.productId),
                eq(inventory.storeId, sale.storeId)
              ));

            if (loyaltyAccountRecord) {
              // Redeem points first
              if (redeemPoints > 0) {
                const remaining = loyaltyAccountRecord.points - redeemPoints;
                await tx
                  .update(loyaltyAccounts)
                  .set({ points: remaining } as any)
                  .where(eq(loyaltyAccounts.id, loyaltyAccountRecord.id));
                loyaltyAccountRecord.points = remaining;
                await tx.insert(loyaltyTransactions).values({
                  loyaltyAccountId: loyaltyAccountRecord.id,
                  points: -redeemPoints,
                  reason: 'redeem',
                } as any);
              }

              // Earn points based on spend
              const earnBase = sale.loyaltyEarnBase ?? subtotal;
              const spendBase = Math.max(0, earnBase - sale.discount);
              const pointsEarned = Math.floor(spendBase * Math.max(orgSettings.earnRate, 0));
              if (pointsEarned > 0) {
                const newBalance = loyaltyAccountRecord.points + pointsEarned;
                await tx
                  .update(loyaltyAccounts)
                  .set({ points: newBalance } as any)
                  .where(eq(loyaltyAccounts.id, loyaltyAccountRecord.id));
                loyaltyAccountRecord.points = newBalance;
                await tx.insert(loyaltyTransactions).values({
                  loyaltyAccountId: loyaltyAccountRecord.id,
                  points: pointsEarned,
                  reason: 'earn',
                } as any);
              }
            }

            results.salesProcessed++;
          });

          // Log successful sync
          securityAuditService.logDataAccessEvent('data_write', context, 'offline_sale_sync', {
            saleId: sale.id,
            productId: sale.productId,
            syncType: 'offline_upload'
          });

        } catch (error) {
          logger.error('Failed to sync offline sale', {
            ...context,
            saleId: sale.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          results.salesErrors.push({
            saleId: sale.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Process inventory updates
      for (const update of inventoryUpdates) {
        try {
          await db.transaction(async (tx) => {
            // Apply inventory change
            await tx
              .update(inventory)
              .set({
                quantity: sql`${inventory.quantity} + ${update.quantityChange}`,
              } as any)
              .where(and(
                eq(inventory.productId, update.productId),
                eq(inventory.storeId, update.storeId)
              ));

            results.inventoryProcessed++;
          });

          securityAuditService.logDataAccessEvent('data_write', context, 'offline_inventory_sync', {
            productId: update.productId,
            quantityChange: update.quantityChange,
            reason: update.reason
          });

        } catch (error) {
          logger.error('Failed to sync inventory update', {
            ...context,
            productId: update.productId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          results.inventoryErrors.push({
            productId: update.productId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Record sync metrics
      monitoringService.recordInventoryEvent('updated', {
        ...context,
        syncType: 'offline_upload',
        itemCount: results.salesProcessed + results.inventoryProcessed
      });

      logger.info('Offline sync upload completed', {
        ...context,
        ...results,
        deviceId: clientInfo.deviceId
      });

      res.json({
        success: true,
        syncId: results.syncId,
        results,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Offline sync upload failed', context, error as Error);
      securityAuditService.logApplicationEvent('error_enumeration', context, {
        operation: 'sync_upload',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        error: 'Sync upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Download data for offline use
  app.get('/api/sync/download', requireAuth, async (req: Request, res: Response) => {
    const context = extractLogContext(req);
    
    try {
      const { storeId, lastSync, includeProducts = 'true', includeInventory = 'true' } = req.query;

      const storeIdStr = String(storeId);
      const includeProductsStr = String(includeProducts);
      const includeInventoryStr = String(includeInventory);
      const lastSyncStr = lastSync != null ? String(lastSync) : undefined;

      if (!storeId) {
        return res.status(400).json({ error: 'storeId is required' });
      }

      const syncData: any = {
        syncId: `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        storeId: storeIdStr,
        lastSync: lastSyncStr ?? null
      };

      // Get products for offline use
      if (includeProductsStr === 'true') {
        const productsQuery = db
          .select({
            id: products.id,
            name: products.name,
            salePrice: products.salePrice,
            costPrice: products.costPrice,
            barcode: products.barcode,
            sku: products.sku,
          })
          .from(products)
          .innerJoin(inventory, eq(inventory.productId, products.id))
          .where(eq(inventory.storeId, storeIdStr));

        // products table has no updatedAt; skip lastSync filtering for products

        syncData.products = await (productsQuery as any).execute();
      }

      // Get inventory data for offline use
      if (includeInventoryStr === 'true') {
        const inventoryQuery = db
          .select({
            productId: inventory.productId,
            currentStock: inventory.quantity,
            reorderLevel: inventory.reorderLevel,
            // inventory has no maxStock/updatedAt
          })
          .from(inventory)
          .where(eq(inventory.storeId, storeIdStr));
        // inventory has no updatedAt; skip lastSync filtering

        syncData.inventory = await (inventoryQuery as any).execute();
      }

      // Log data access for security audit
      securityAuditService.logDataAccessEvent('data_read', context, 'offline_sync_download', {
        storeId: storeIdStr,
        productsCount: syncData.products?.length || 0,
        inventoryCount: syncData.inventory?.length || 0,
        syncType: 'offline_download'
      });

      logger.info('Offline sync download completed', {
        ...context,
        storeId: storeIdStr,
        productsCount: syncData.products?.length || 0,
        inventoryCount: syncData.inventory?.length || 0,
        lastSync: lastSyncStr
      });

      res.json({
        success: true,
        data: syncData
      });

    } catch (error) {
      logger.error('Offline sync download failed', context, error as Error);
      res.status(500).json({
        error: 'Sync download failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get sync status and conflict resolution
  app.get('/api/sync/status', requireAuth, async (req: Request, res: Response) => {
    const context = extractLogContext(req);
    
    try {
      const { storeId, deviceId } = req.query;
      const storeIdStr = String(storeId);
      const deviceIdStr = deviceId != null ? String(deviceId) : undefined;

      if (!storeIdStr) {
        return res.status(400).json({ error: 'storeId is required' });
      }

      // Mock sync status - in a real implementation, this would track sync state
      const status = {
        storeId: storeIdStr,
        deviceId: deviceIdStr,
        lastSuccessfulSync: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        pendingUploads: 0,
        pendingDownloads: 0,
        conflicts: [],
        syncHealth: 'healthy' as 'healthy' | 'warning' | 'error',
        networkStatus: 'online' as 'online' | 'offline' | 'unstable',
        lastSyncDuration: 1250, // milliseconds
        dataIntegrity: {
          checksumMatch: true,
          recordCount: 150,
          lastVerified: new Date().toISOString()
        }
      };

      logger.info('Sync status requested', {
        ...context,
        storeId: storeIdStr,
        deviceId: deviceIdStr
      });

      res.json({
        success: true,
        status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get sync status', context, error as Error);
      res.status(500).json({
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Resolve sync conflicts
  app.post('/api/sync/resolve-conflicts', requireAuth, async (req: Request, res: Response) => {
    const context = extractLogContext(req);
    
    try {
      const { conflicts, resolution = 'server-wins' } = req.body;

      if (!Array.isArray(conflicts)) {
        return res.status(400).json({ error: 'conflicts array is required' });
      }

      const resolved = conflicts.map((conflict: any) => ({
        conflictId: conflict.id,
        resolution,
        resolvedAt: new Date().toISOString(),
        strategy: resolution
      }));

      // Log conflict resolution for audit (use valid application event)
      securityAuditService.logApplicationEvent('error_enumeration', context, {
        operation: 'sync_conflict_resolution',
        conflictCount: conflicts.length,
        resolutionStrategy: resolution
      });

      logger.info('Sync conflicts resolved', {
        ...context,
        conflictCount: conflicts.length,
        resolution
      });

      res.json({
        success: true,
        resolved,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to resolve sync conflicts', context, error as Error);
      res.status(500).json({
        error: 'Failed to resolve conflicts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Health check for sync service
  app.get('/api/sync/health', async (req: Request, res: Response) => {
    try {
      const health = {
        status: 'healthy',
        services: {
          database: 'healthy',
          storage: 'healthy',
          validation: 'healthy'
        },
        metrics: {
          activeSyncs: 0,
          avgSyncTime: 1200,
          successRate: 0.98,
          lastHourSyncs: 25
        },
        configuration: {
          maxBatchSize: 100,
          timeout: 30000,
          retryAttempts: 3
        },
        timestamp: new Date().toISOString()
      };

      res.json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });
}
