import { eq, and, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { organizations, stores as prdStores, products as prdProducts, inventory as prdInventory } from '@shared/prd-schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { storage } from '../storage';

export async function registerTestRoutes(app: Express) {
  app.post('/api/test/seed-basic', async (req: Request, res: Response) => {
    if (process.env.NODE_ENV !== 'test') {
      return res.status(404).json({ error: 'Not found' });
    }

    try {
      // 1) Seed minimal data via storage (in-memory in test env)
      // Store
      const existingStores = await storage.getAllStores();
      let store = existingStores[0];
      if (!store) {
        store = await storage.createStore({ name: 'Test Store' } as any);
      }

      const storeId = (store as any).id as string;

      // Products + Inventory
      const skus = ['TEST-SKU-1', 'TEST-SKU-2', 'TEST-SKU-3'];
      const createdProducts: Array<{ id: string; sku: string }> = [];
      for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        let p = await storage.getProductBySku(sku);
        if (!p) {
          p = await storage.createProduct({
            name: `Test Product ${i + 1}`,
            sku,
            barcode: `0000${i + 1}`,
            price: String(100 + i * 50),
            cost: String(50 + i * 20),
            category: 'General',
            brand: 'TestBrand',
            isActive: true,
          } as any);
        }
        createdProducts.push({ id: (p as any).id, sku: (p as any).sku });
        const inv = await storage.getInventoryItem((p as any).id, storeId);
        if (!inv) {
          await storage.createInventory({
            productId: (p as any).id,
            storeId,
            quantity: 50 + i * 10,
            minStockLevel: 5,
          } as any);
        }
      }

      // Ensure a test admin user exists (used by login and POS flows)
      let user = await storage.getUserByEmail('admin@chainsync.com');
      if (!user) {
        user = await storage.createUser({
          username: 'admin',
          email: 'admin@chainsync.com',
          password: 'admin123',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin' as any,
          isActive: true,
          emailVerified: true,
          signupCompleted: true,
        } as any);
      }

      // 2) Best-effort: also seed PRD schema to satisfy any routes that read PRD tables directly
      let orgId: string | null = null;
      try {
        const orgRows = await db.select().from(organizations).where(eq(organizations.name, 'Test Org'));
        let org = orgRows[0];
        if (!org) {
          const ins = await db.insert(organizations).values({ name: 'Test Org', isActive: true } as any).returning();
          org = ins[0];
        }
        orgId = (org as any).id;

        // Store in PRD schema
        const sRows = await db.select().from(prdStores).where(and(eq(prdStores.orgId, orgId), eq(prdStores.name, 'Test Store')));
        let s = sRows[0];
        if (!s) {
          const ins = await db.insert(prdStores).values({ orgId, name: 'Test Store' } as any).returning();
          s = ins[0];
        }

        // Products in PRD schema and per-store inventory
        for (let i = 0; i < skus.length; i++) {
          const sku = skus[i];
          const prodRows = await db.select().from(prdProducts).where(and(eq(prdProducts.orgId, orgId), eq(prdProducts.sku, sku)));
          let pp = prodRows[0];
          if (!pp) {
            const ins = await db.insert(prdProducts).values({
              orgId,
              sku,
              barcode: `0000${i + 1}`,
              name: `Test Product ${i + 1}`,
              costPrice: String(50 + i * 20),
              salePrice: String(100 + i * 50),
              vatRate: '0',
            } as any).returning();
            pp = ins[0];
          }

          try {
            // Prefer raw SQL upsert where available
            if (typeof (db as any).execute === 'function') {
              await (db as any).execute(sql`INSERT INTO inventory (store_id, product_id, quantity, reorder_level)
                VALUES (${s.id}, ${pp.id}, ${50 + i * 10}, 5)
                ON CONFLICT (store_id, product_id)
                DO UPDATE SET quantity = EXCLUDED.quantity`);
            } else {
              // Fallback: try insert; ignore errors
              await db.insert(prdInventory).values({
                storeId: s.id,
                productId: pp.id,
                quantity: 50 + i * 10,
                reorderLevel: 5,
              } as any).catch(() => undefined);
            }
          } catch (error) {
            logger.warn('Failed to upsert PRD inventory during test seed', {
              orgId,
              storeId: s.id,
              productId: pp?.id,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to seed PRD schema during test seed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return res.status(200).json({
        ok: true,
        orgId,
        storeId,
        userId: (user as any)?.id || null,
        products: createdProducts,
      });
    } catch (error) {
      logger.error('Test seed route failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to seed test data' });
    }
  });
}


