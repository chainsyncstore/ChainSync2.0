import { db } from '../db';
import { syncQueue, transactions, transactionItems, inventory, products } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { ConflictResolver } from './conflict-resolver';
import { DataValidator } from './data-validator';

export interface SyncItem {
  id: string;
  entityType: 'transaction' | 'inventory' | 'product';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: Date;
  retryCount: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
}

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  failedItems: number;
  conflicts: number;
  errors: string[];
}

export interface ConflictResolution {
  resolved: boolean;
  action: 'accept_local' | 'accept_server' | 'merge' | 'manual';
  data?: any;
  message?: string;
}

export class SyncService {
  private conflictResolver: ConflictResolver;
  private dataValidator: DataValidator;
  private isProcessing: boolean = false;

  constructor() {
    this.conflictResolver = new ConflictResolver();
    this.dataValidator = new DataValidator();
  }

  /**
   * Add item to sync queue
   */
  async addToSyncQueue(
    storeId: string,
    userId: string,
    entityType: string,
    action: string,
    data: any,
    entityId?: string
  ): Promise<string> {
    try {
      // Validate data before adding to queue
      const validationResult = await this.dataValidator.validate(entityType, data);
      if (!validationResult.valid) {
        throw new Error(`Data validation failed: ${validationResult.errors.join(', ')}`);
      }

      const result = await db.insert(syncQueue).values({
        storeId,
        userId,
        entityType,
        entityId,
        action,
        data,
        status: 'pending',
        retryCount: 0
      }).returning();

      logger.info('Item added to sync queue', {
        queueId: result[0].id,
        entityType,
        action,
        storeId,
        userId
      });

      return result[0].id;
    } catch (error) {
      logger.error('Error adding item to sync queue', {
        entityType,
        action,
        storeId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process sync queue
   */
  async processSyncQueue(storeId?: string): Promise<SyncResult> {
    if (this.isProcessing) {
      logger.warn('Sync processing already in progress');
      return { success: false, syncedItems: 0, failedItems: 0, conflicts: 0, errors: ['Sync already in progress'] };
    }

    this.isProcessing = true;
    const result: SyncResult = {
      success: true,
      syncedItems: 0,
      failedItems: 0,
      conflicts: 0,
      errors: []
    };

    try {
      // Get pending items
      const whereClause = storeId 
        ? and(eq(syncQueue.status, 'pending'), eq(syncQueue.storeId, storeId))
        : eq(syncQueue.status, 'pending');

      const pendingItems = await db.select()
        .from(syncQueue)
        .where(whereClause)
        .orderBy(desc(syncQueue.createdAt));

      logger.info('Processing sync queue', {
        totalItems: pendingItems.length,
        storeId: storeId || 'all'
      });

      for (const item of pendingItems) {
        try {
          // Mark as syncing
          await this.updateSyncStatus(item.id, 'syncing');

          // Process the item
          const itemResult = await this.processSyncItem(item);
          
          if (itemResult.success) {
            result.syncedItems++;
            await this.updateSyncStatus(item.id, 'synced');
          } else if (itemResult.conflict) {
            result.conflicts++;
            await this.updateSyncStatus(item.id, 'conflict');
          } else {
            result.failedItems++;
            await this.handleSyncFailure(item, itemResult.error);
          }
        } catch (error) {
          result.failedItems++;
          result.errors.push(`Item ${item.id}: ${error.message}`);
          await this.handleSyncFailure(item, error.message);
        }
      }

      logger.info('Sync queue processing completed', result);
    } catch (error) {
      result.success = false;
      result.errors.push(`Sync processing failed: ${error.message}`);
      logger.error('Error processing sync queue', { error: error.message });
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Process individual sync item
   */
  private async processSyncItem(item: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
    try {
      switch (item.entityType) {
        case 'transaction':
          return await this.syncTransaction(item);
        case 'inventory':
          return await this.syncInventory(item);
        case 'product':
          return await this.syncProduct(item);
        default:
          throw new Error(`Unknown entity type: ${item.entityType}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync transaction data
   */
  private async syncTransaction(item: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
    try {
      const { action, data, entityId } = item;

      switch (action) {
        case 'create':
          // Check for duplicate transaction
          if (data.localId) {
            const existing = await db.select()
              .from(transactions)
              .where(eq(transactions.id, data.localId));
            
            if (existing.length > 0) {
              // Conflict detected
              const resolution = await this.conflictResolver.resolveTransactionConflict(
                'duplicate',
                data,
                existing[0]
              );
              
              if (resolution.resolved) {
                if (resolution.action === 'accept_local') {
                  // Update existing transaction
                  await db.update(transactions)
                    .set(resolution.data)
                    .where(eq(transactions.id, data.localId));
                }
                return { success: true };
              } else {
                return { success: false, conflict: true, error: 'Unresolved conflict' };
              }
            }
          }

          // Create new transaction
          const transactionResult = await db.insert(transactions).values({
            id: data.localId || undefined,
            storeId: data.storeId,
            userId: data.userId,
            total: data.total,
            status: data.status,
            paymentMethod: data.paymentMethod,
            createdAt: data.createdAt || new Date()
          }).returning();

          // Create transaction items
          if (data.items && data.items.length > 0) {
            const items = data.items.map((item: any) => ({
              transactionId: transactionResult[0].id,
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.total
            }));

            await db.insert(transactionItems).values(items);
          }

          return { success: true };

        case 'update':
          if (!entityId) {
            throw new Error('Entity ID required for update');
          }

          await db.update(transactions)
            .set(data)
            .where(eq(transactions.id, entityId));

          return { success: true };

        case 'delete':
          if (!entityId) {
            throw new Error('Entity ID required for delete');
          }

          // Delete transaction items first
          await db.delete(transactionItems)
            .where(eq(transactionItems.transactionId, entityId));

          // Delete transaction
          await db.delete(transactions)
            .where(eq(transactions.id, entityId));

          return { success: true };

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync inventory data
   */
  private async syncInventory(item: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
    try {
      const { action, data, entityId } = item;

      switch (action) {
        case 'create':
          await db.insert(inventory).values({
            productId: data.productId,
            storeId: data.storeId,
            quantity: data.quantity,
            minStockLevel: data.minStockLevel,
            maxStockLevel: data.maxStockLevel,
            lastRestocked: data.lastRestocked
          });
          return { success: true };

        case 'update':
          if (!entityId) {
            throw new Error('Entity ID required for update');
          }

          // Check for conflicts in inventory updates
          const existing = await db.select()
            .from(inventory)
            .where(eq(inventory.id, entityId));

          if (existing.length > 0) {
            const resolution = await this.conflictResolver.resolveInventoryConflict(
              'quantity_mismatch',
              data,
              existing[0]
            );

            if (resolution.resolved) {
              await db.update(inventory)
                .set(resolution.data)
                .where(eq(inventory.id, entityId));
              return { success: true };
            } else {
              return { success: false, conflict: true, error: 'Unresolved inventory conflict' };
            }
          }

          return { success: false, error: 'Inventory record not found' };

        case 'delete':
          if (!entityId) {
            throw new Error('Entity ID required for delete');
          }

          await db.delete(inventory)
            .where(eq(inventory.id, entityId));

          return { success: true };

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync product data
   */
  private async syncProduct(item: any): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
    try {
      const { action, data, entityId } = item;

      switch (action) {
        case 'create':
          await db.insert(products).values({
            name: data.name,
            sku: data.sku,
            barcode: data.barcode,
            description: data.description,
            price: data.price,
            cost: data.cost,
            category: data.category,
            brand: data.brand
          });
          return { success: true };

        case 'update':
          if (!entityId) {
            throw new Error('Entity ID required for update');
          }

          await db.update(products)
            .set(data)
            .where(eq(products.id, entityId));

          return { success: true };

        case 'delete':
          if (!entityId) {
            throw new Error('Entity ID required for delete');
          }

          await db.delete(products)
            .where(eq(products.id, entityId));

          return { success: true };

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update sync status
   */
  private async updateSyncStatus(queueId: string, status: string, syncedAt?: Date) {
    await db.update(syncQueue)
      .set({
        status,
        syncedAt: syncedAt || new Date(),
        updatedAt: new Date()
      })
      .where(eq(syncQueue.id, queueId));
  }

  /**
   * Handle sync failure
   */
  private async handleSyncFailure(item: any, error: string) {
    const newRetryCount = item.retryCount + 1;
    const maxRetries = 3;

    if (newRetryCount >= maxRetries) {
      await db.update(syncQueue)
        .set({
          status: 'failed',
          retryCount: newRetryCount,
          errorMessage: error,
          updatedAt: new Date()
        })
        .where(eq(syncQueue.id, item.id));
    } else {
      await db.update(syncQueue)
        .set({
          status: 'pending',
          retryCount: newRetryCount,
          errorMessage: error,
          updatedAt: new Date()
        })
        .where(eq(syncQueue.id, item.id));
    }

    logger.warn('Sync item failed', {
      queueId: item.id,
      entityType: item.entityType,
      action: item.action,
      retryCount: newRetryCount,
      error
    });
  }

  /**
   * Get sync queue status
   */
  async getSyncStatus(storeId?: string): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    conflicts: number;
  }> {
    const whereClause = storeId ? eq(syncQueue.storeId, storeId) : undefined;

    const items = await db.select({ status: syncQueue.status })
      .from(syncQueue)
      .where(whereClause);

    const status = {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      conflicts: 0
    };

    items.forEach(item => {
      status[item.status as keyof typeof status]++;
    });

    return status;
  }

  /**
   * Clear completed sync items
   */
  async clearCompletedItems(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db.delete(syncQueue)
      .where(
        and(
          eq(syncQueue.status, 'synced'),
          syncQueue.syncedAt < cutoffDate
        )
      );

    logger.info('Cleared completed sync items', { deletedCount: result.rowCount });
    return result.rowCount || 0;
  }

  /**
   * Retry failed items
   */
  async retryFailedItems(storeId?: string): Promise<number> {
    const whereClause = storeId 
      ? and(eq(syncQueue.status, 'failed'), eq(syncQueue.storeId, storeId))
      : eq(syncQueue.status, 'failed');

    const result = await db.update(syncQueue)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        updatedAt: new Date()
      })
      .where(whereClause);

    logger.info('Retried failed sync items', { retriedCount: result.rowCount });
    return result.rowCount || 0;
  }
} 