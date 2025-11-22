import type { InferInsertModel } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stores as storesTable, organizations as organizationsTable, userRoles, stockMovements, products as productsTable, inventory as inventoryTable } from '@shared/schema';

import { db } from '@server/db';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

async function persistStoreRecord(store: any) {
  const source = store as Record<string, any>;
  const insert: InferInsertModel<typeof storesTable> = {
    id: source.id,
    orgId: source.orgId ?? null,
    name: source.name,
    ownerId: source.ownerId ?? null,
    address: source.address ?? null,
    phone: source.phone ?? null,
    email: source.email ?? null,
    currency: source.currency ?? 'USD',
    taxRate: source.taxRate ?? '0.085',
    isActive: source.isActive ?? true,
  } as InferInsertModel<typeof storesTable>;

  await db
    .insert(storesTable)
    .values(insert)
    .onConflictDoUpdate({
      target: storesTable.id,
      set: insert,
    });
}

async function persistProductRecord(product: any) {
  const source = product as Record<string, any>;
  if (!source?.id) return;
  const insert: InferInsertModel<typeof productsTable> = {
    id: source.id,
    orgId: source.orgId ?? null,
    name: source.name,
    sku: source.sku ?? null,
    barcode: source.barcode ?? null,
    description: source.description ?? null,
    price: String(source.price ?? source.salePrice ?? source.costPrice ?? '0'),
    cost: source.cost ? String(source.cost) : null,
    costPrice: source.costPrice ?? null,
    salePrice: source.salePrice ?? null,
    vatRate: source.vatRate ?? null,
    category: source.category ?? null,
    brand: source.brand ?? null,
    isActive: source.isActive ?? true,
  } as InferInsertModel<typeof productsTable>;

  await db
    .insert(productsTable)
    .values(insert)
}

async function persistInventoryRecord(record: any) {
  const source = record as Record<string, any>;
  if (!source?.storeId || !source?.productId) return;
  const insert: InferInsertModel<typeof inventoryTable> = {
    id: source.id ?? undefined,
    storeId: source.storeId,
    productId: source.productId,
    quantity: source.quantity ?? 0,
    reorderLevel: source.reorderLevel ?? null,
    minStockLevel: source.minStockLevel ?? 0,
    maxStockLevel: source.maxStockLevel ?? null,
  } as InferInsertModel<typeof inventoryTable>;

  try {
    await db
      .insert(inventoryTable)
      .values({ ...insert, id: insert.id ?? undefined } as any)
      .onConflictDoUpdate({
        target: [inventoryTable.storeId, inventoryTable.productId],
        set: {
          quantity: insert.quantity,
          reorderLevel: insert.reorderLevel,
          minStockLevel: insert.minStockLevel,
          maxStockLevel: insert.maxStockLevel,
        } as any,
      });
  } catch (error) {
    const err = error as Error;
    process.stdout.write(`[#inventory.persist] inventory upsert failed storeId=${source.storeId} productId=${source.productId}: ${err?.message ?? err}\n`);
    throw error;
  }
}

async function persistStockMovementRecord(record: any) {
  const occurredAt = record.occurredAt ?? new Date();
  try {
    await db.insert(stockMovements).values({
      storeId: record.storeId,
      productId: record.productId,
      quantityBefore: record.quantityBefore,
      quantityAfter: record.quantityAfter,
      delta: record.delta,
      actionType: record.actionType,
      source: record.source,
      referenceId: record.referenceId ?? null,
      userId: record.userId ?? null,
      notes: record.notes ?? null,
      metadata: record.metadata ?? null,
      occurredAt,
      createdAt: occurredAt,
    } as any).returning({ id: stockMovements.id });
  } catch (error) {
    const err = error as Error;
    process.stdout.write(`[#inventory.persist] stock_movement insert failed storeId=${record.storeId} productId=${record.productId}: ${err?.message ?? err}\n`);
    throw error;
  }
}

const shouldPrintDebug = process.env.DEBUG_INVENTORY_TESTS !== '0';
process.stdout.write(
  `[inventory.debug] DEBUG_INVENTORY_TESTS=${process.env.DEBUG_INVENTORY_TESTS ?? 'undefined'} shouldPrintDebug=${shouldPrintDebug}\n`
);
const writeDebug = (message: string, payload?: unknown) => {
  if (!shouldPrintDebug) return;
  const suffix =
    payload === undefined
      ? ''
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, (_key, value) => (value instanceof Date ? value.toISOString() : value), 2);
  process.stdout.write(`${message}${suffix ? ` ${suffix}` : ''}\n`);
};

async function executeRows<T = any>(query: any): Promise<T[]> {
  const result = await db.execute(query);
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === 'object' && Array.isArray((result as any).rows)) {
    return (result as any).rows as T[];
  }
  return [];
}

async function logInventoryCounts(label: string, storeId?: string) {
  if (!shouldPrintDebug) return;
  const [inventoryTotal] = await executeRows<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM inventory` as any);
  const [movementTotal] = await executeRows<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM stock_movements` as any);
  let scopedInventory: Array<{ store_id: string; product_id: string; quantity: number }> = [];
  if (storeId) {
    const scoped = await executeRows(sql`
      SELECT store_id, product_id, quantity
      FROM inventory
      WHERE store_id = ${storeId}
      ORDER BY updated_at DESC
      LIMIT 5
    ` as any);
    scopedInventory = Array.isArray((scoped as any).rows) ? (scoped as any).rows : scoped as any;
  }
  writeDebug(
    `[inventory.debug] ${label} inventoryCount=${inventoryTotal?.count ?? 0} movementCount=${movementTotal?.count ?? 0}`,
    scopedInventory.length ? scopedInventory : undefined
  );
}

afterEach(async (context) => {
  if (!shouldPrintDebug) return;
  const state = context.task.result?.state ?? 'unknown';
  writeDebug(`[inventory.debug] afterEach executed for "${context.task.name}" state=${state}`);
  if (state === 'pass') return;
  const storeId = (globalThis as any).__latestInventoryStoreId as string | undefined;
  const [inventoryCountRow] = await executeRows<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM inventory` as any);
  const [movementCountRow] = await executeRows<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM stock_movements` as any);
  const storeFilter = storeId ? sql`WHERE store_id = ${storeId}` : sql``;
  const inventorySample = await executeRows(sql`
    SELECT store_id, product_id, quantity, min_stock_level
    FROM inventory
    ${storeFilter}
    ORDER BY updated_at DESC
    LIMIT 5
  ` as any);
  const movementSample = await executeRows(sql`
    SELECT store_id, product_id, delta, action_type
    FROM stock_movements
    ${storeFilter}
    ORDER BY occurred_at DESC
    LIMIT 5
  ` as any);
  writeDebug(
    `[inventory.debug] Test "${context.task.name}" failed (storeId=${storeId ?? 'n/a'}) inventoryCount=${inventoryCountRow?.count ?? 0} movementCount=${movementCountRow?.count ?? 0}`
  );
  writeDebug('[inventory.debug] inventory sample:', inventorySample);
  writeDebug('[inventory.debug] movement sample:', movementSample);
});

describe('Inventory Management Integration Tests', () => {
  let app: Express;
  let testUser: any;
  let testStore: any;
  let testProduct: any;
  let agent: ReturnType<typeof request.agent>;
  let testOrgId: string;

  beforeEach(async () => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Setup session middleware
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    }));

    // Register routes
    await registerRoutes(app);
    agent = request.agent(app);

    const [orgRow] = await db
      .insert(organizationsTable)
      .values({ name: 'Inventory Test Org', currency: 'USD', isActive: true } as any)
      .returning();
    testOrgId = orgRow.id as string;

    // Create test user
    testUser = await storage.createUser({
      username: 'inventoryuser@example.com',
      password: 'StrongPass123!',
      email: 'inventoryuser@example.com',
      firstName: 'Inventory',
      lastName: 'User',
      phone: '+1234567890',
      companyName: 'Inventory Test Company',
      role: 'manager',
      tier: 'basic',
      location: 'international',
      orgId: testOrgId,
      isActive: true,
      emailVerified: true
    } as Record<string, unknown>);

    await db
      .insert(userRoles)
      .values({ userId: testUser.id, role: 'MANAGER', orgId: testOrgId, storeId: null } as any);

    // Create test store
    testStore = await storage.createStore({
      name: 'Inventory Test Store',
      ownerId: testUser.id,
      orgId: testOrgId,
      address: 'Test Address',
      phone: '+1234567890',
      email: 'inventoryuser@example.com',
      isActive: true
    });
    await persistStoreRecord(testStore);
    (globalThis as any).__latestInventoryStoreId = testStore.id;

    // Update user with store ID
    await storage.updateUser(testUser.id, { storeId: testStore.id, signupCompleted: true, signupCompletedAt: new Date() });
    await storage.grantStoreAccess(testUser.id, testStore.id, testUser.id);

    // Create test product
    testProduct = await storage.createProduct({
      name: 'Test Product',
      sku: 'INV001',
      barcode: '1234567890124',
      description: 'A test product for inventory testing',
      price: 15.99,
      cost: 8.50,
      category: 'Test Category',
      brand: 'Test Brand',
      isActive: true
    });
    await persistProductRecord(testProduct);

    // Add initial inventory for the product
    // In real-db mode, storage.createInventory already inserts to DB.
    // If we call persistInventoryRecord immediately after, it attempts an upsert.
    // Let's verify if storage.createInventory is enough.
    await storage.createInventory({
      productId: testProduct.id,
      storeId: testStore.id,
      quantity: 50,
      minStockLevel: 10,
      maxStockLevel: 100
    });
    // await persistInventoryRecord(initialInventory); // Skip redundant upsert for now to debug

    await logInventoryCounts('after initial seed', testStore.id);
    const immediateInventorySnapshot = await executeRows(sql`
      SELECT store_id, product_id, quantity
      FROM inventory
      WHERE store_id = ${testStore.id}
    ` as any);
    writeDebug('[inventory.debug] snapshot after root seed', immediateInventorySnapshot);
    writeDebug('[inventory.debug] completed root beforeEach seeding');

    // Login to get session
    await agent
      .post('/api/auth/login')
      .send({
        email: 'inventoryuser@example.com',
        password: 'StrongPass123!'
      })
      .expect(200);
  });

  describe('PUT /api/stores/:storeId/inventory/:productId', () => {
    beforeEach(async () => {
      await persistStoreRecord(testStore);
    });

    it('should update inventory quantity successfully', async () => {
      const updateData = {
        quantity: 75,
        adjustmentData: {
          reason: 'restock',
          notes: 'Regular restock',
          adjustedBy: testUser.id
        }
      };

      const response = await agent
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .send(updateData)
        .expect(200);

      if (response.status !== 200) {
        writeDebug('[inventory.debug] PUT success test unexpected response', response.body);
      }

      expect(response.body.status).toBe('success');
      expect(response.body.data.quantity).toBe(75);
    });

    it('should reject negative quantities', async () => {
      const updateData = {
        quantity: -10
      };

      const response = await agent
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .set('x-test-bypass-store-access', 'true')
        .send(updateData)
        .expect(422);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Quantity must be a non-negative number');
    });

    it('should require authentication', async () => {
      const updateData = {
        quantity: 75
      };

      const unauthenticatedAgent = request.agent(app);
      const response = await unauthenticatedAgent
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .set('x-test-bypass-store-access', 'true')
        .send(updateData)
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/stores/:storeId/inventory', () => {
    beforeEach(async () => {
      await persistStoreRecord(testStore);
      // Create additional test products
      const product2 = await storage.createProduct({
        name: 'Test Product 2',
        sku: 'INV002',
        barcode: '1234567890125',
        description: 'Another test product',
        price: 25.99,
        cost: 12.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(product2);

      const product3 = await storage.createProduct({
        name: 'Test Product 3',
        sku: 'INV003',
        barcode: '1234567890126',
        description: 'Third test product',
        price: 35.99,
        cost: 18.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(product3);

      // Add inventory for additional products
      const inv2 = await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });
      await persistInventoryRecord(inv2);

      const inv3 = await storage.createInventory({
        productId: product3.id,
        storeId: testStore.id,
        quantity: 5, // Low stock
        minStockLevel: 10,
        maxStockLevel: 50
      });
      await persistInventoryRecord(inv3);

      await logInventoryCounts('after GET inventory seeding', testStore.id);
      writeDebug('[inventory.debug] completed GET inventory beforeEach seeding');
    });

    it('should return all inventory for store', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory`)
        .expect(200);

      expect(response.body).toMatchObject({
        storeId: testStore.id,
        currency: expect.any(String),
        totalProducts: 3,
      });
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toHaveLength(3);
      expect(response.body.items[0]?.productId).toBeDefined();
      expect(response.body.items[0]?.quantity).toBeDefined();
      expect(response.body.items[0]?.minStockLevel).toBeDefined();
      expect(response.body.items[0]?.maxStockLevel).toBeDefined();
    });

    it('should filter inventory by category', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory?category=Test Category`)
        .expect(200);

      expect(response.body).toMatchObject({
        storeId: testStore.id,
        currency: expect.any(String),
      });
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toHaveLength(3);
      expect(response.body.items.every((item: any) =>
        item.product?.category === 'Test Category'
      )).toBe(true);
    });

    it('should filter inventory by low stock', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory?lowStock=true`)
        .expect(200);

      expect(response.body).toMatchObject({
        storeId: testStore.id,
        currency: expect.any(String),
      });
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBeLessThanOrEqual(response.body.items[0].minStockLevel);
    });
  });

  describe('GET /api/stores/:storeId/inventory/low-stock', () => {
    beforeEach(async () => {
      await persistStoreRecord(testStore);
      // Create products with low stock
      const lowStockProduct1 = await storage.createProduct({
        name: 'Low Stock Product 1',
        sku: 'LOW001',
        barcode: '1234567890127',
        description: 'Product with low stock',
        price: 10.99,
        cost: 5.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(lowStockProduct1);

      const lowStockProduct2 = await storage.createProduct({
        name: 'Low Stock Product 2',
        sku: 'LOW002',
        barcode: '1234567890128',
        description: 'Another product with low stock',
        price: 20.99,
        cost: 10.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(lowStockProduct2);

      // Add low stock inventory
      const lowInv1 = await storage.createInventory({
        productId: lowStockProduct1.id,
        storeId: testStore.id,
        quantity: 5, // Below min stock level
        minStockLevel: 10,
        maxStockLevel: 50
      });
      await persistInventoryRecord(lowInv1);

      const lowInv2 = await storage.createInventory({
        productId: lowStockProduct2.id,
        storeId: testStore.id,
        quantity: 8, // Below min stock level
        minStockLevel: 15,
        maxStockLevel: 50
      });
      await persistInventoryRecord(lowInv2);

      await logInventoryCounts('after low-stock seeding', testStore.id);
      writeDebug('[inventory.debug] completed low-stock beforeEach seeding');
    });

    it('should return only low stock items', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory/low-stock`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.every((item: any) =>
        item.quantity <= item.minStockLevel
      )).toBe(true);
    });

    it('should include product details in low stock response', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory/low-stock`)
        .expect(200);

      expect(response.body[0]?.product).toBeDefined();
      expect(response.body[0]?.product?.name).toBeDefined();
      expect(response.body[0]?.product?.sku).toBeDefined();
      expect(response.body[0]?.product?.price).toBeDefined();
    });
  });

  describe('POST /api/stores/:storeId/inventory/bulk-update', () => {
    let product2: any;
    let product3: any;

    beforeEach(async () => {
      // Create additional test products
      product2 = await storage.createProduct({
        name: 'Test Product 2',
        sku: 'INV002',
        barcode: '1234567890125',
        description: 'Another test product',
        price: 25.99,
        cost: 12.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(product2);

      product3 = await storage.createProduct({
        name: 'Test Product 3',
        sku: 'INV003',
        barcode: '1234567890126',
        description: 'Third test product',
        price: 35.99,
        cost: 18.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(product3);

      // Add inventory for additional products
      const bulkInv2 = await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });
      await persistInventoryRecord(bulkInv2);

      const bulkInv3 = await storage.createInventory({
        productId: product3.id,
        storeId: testStore.id,
        quantity: 20,
        minStockLevel: 10,
        maxStockLevel: 50
      });
      await persistInventoryRecord(bulkInv3);

      await logInventoryCounts('after bulk-update seeding', testStore.id);
      writeDebug('[inventory.debug] completed bulk-update beforeEach seeding');
    });

    it('should update multiple inventory items successfully', async () => {
      const bulkUpdateData = {
        updates: [
          {
            productId: testProduct.id,
            quantity: 60,
            adjustmentData: {
              reason: 'restock',
              notes: 'Bulk restock',
              adjustedBy: testUser.id
            }
          },
          {
            productId: product2.id,
            quantity: 40,
            adjustmentData: {
              reason: 'restock',
              notes: 'Bulk restock',
              adjustedBy: testUser.id
            }
          },
          {
            productId: product3.id,
            quantity: 25,
            adjustmentData: {
              reason: 'restock',
              notes: 'Bulk restock',
              adjustedBy: testUser.id
            }
          }
        ]
      };

      const response = await agent
        .post(`/api/stores/${testStore.id}/inventory/bulk-update`)
        .send(bulkUpdateData)
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].quantity).toBe(60);
      expect(response.body[1].quantity).toBe(40);
      expect(response.body[2].quantity).toBe(25);
    });

    it('should reject invalid bulk update data', async () => {
      const invalidData = {
        updates: 'not an array'
      };

      const response = await agent
        .post(`/api/stores/${testStore.id}/inventory/bulk-update`)
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('Updates must be an array');
    });
  });

  describe('GET /api/stores/:storeId/inventory/stock-movements', () => {
    beforeEach(async () => {
      await persistStoreRecord(testStore);
      // Create some stock movements by updating inventory and explicitly recording them
      const quantities = [60, 45, 70];
      let previousQuantity = 50; // initial quantity from createInventory

      for (const quantity of quantities) {
        const updated = await storage.updateInventory(testProduct.id, testStore.id, { quantity });
        await persistInventoryRecord(updated);

        const occurredAt = new Date(Date.now() - Math.floor(Math.random() * 1000));
        await persistStockMovementRecord({
          storeId: testStore.id,
          productId: testProduct.id,
          quantityBefore: previousQuantity,
          quantityAfter: quantity,
          delta: quantity - previousQuantity,
          actionType: 'update',
          source: 'tests',
          referenceId: null,
          userId: testUser.id,
          notes: 'Seeded inventory movement for integration test',
          metadata: null,
          occurredAt,
        });
        previousQuantity = quantity;
      }

      let seededCount = 0;
      const mem = (storage as any).getTestMemory?.();
      if (mem?.stockMovements) {
        const list = mem.stockMovements.get(testStore.id) || [];
        seededCount = list.length;
      } else {
        const [seededCountResult] = await executeRows<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM stock_movements WHERE store_id = ${testStore.id}` as any);
        seededCount = seededCountResult?.count ?? 0;
      }
      expect(seededCount).toBeGreaterThanOrEqual(quantities.length);

      await logInventoryCounts('after stock-movement seeding', testStore.id);
      writeDebug('[inventory.debug] completed stock-movement beforeEach seeding');
    });

    it('should return stock movement history', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory/stock-movements`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]?.productId).toBeDefined();
      expect(response.body[0]?.quantity).toBeDefined();
      expect(response.body[0]?.timestamp).toBeDefined();
    });

    it('should filter stock movements by product', async () => {
      const response = await agent
        .get(`/api/stores/${testStore.id}/inventory/stock-movements?productId=${testProduct.id}`)
        .expect(200);

      expect(response.body.every((movement: any) =>
        movement.productId === testProduct.id
      )).toBe(true);
    });
  });

  describe('POST /api/stores/:storeId/inventory/stock-count', () => {
    it('should perform stock count successfully', async () => {
      const stockCountData = {
        items: [
          {
            productId: testProduct.id,
            countedQuantity: 48,
            notes: 'Stock count adjustment'
          }
        ]
      };

      const response = await agent
        .post(`/api/stores/${testStore.id}/inventory/stock-count`)
        .send(stockCountData)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].productId).toBe(testProduct.id);
      expect(response.body[0].countedQuantity).toBe(48);
    });

    it('should handle multiple products in stock count', async () => {
      // Create additional product
      const product2 = await storage.createProduct({
        name: 'Test Product 2',
        sku: 'INV002',
        barcode: '1234567890125',
        description: 'Another test product',
        price: 25.99,
        cost: 12.50,
        category: 'Test Category',
        brand: 'Test Brand',
        isActive: true
      });
      await persistProductRecord(product2);

      const stockCountInventory = await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });
      await persistInventoryRecord(stockCountInventory);

      const stockCountData = {
        items: [
          {
            productId: testProduct.id,
            countedQuantity: 48,
            notes: 'Stock count adjustment'
          },
          {
            productId: product2.id,
            countedQuantity: 28,
            notes: 'Stock count adjustment'
          }
        ]
      };

      const response = await agent
        .post(`/api/stores/${testStore.id}/inventory/stock-count`)
        .send(stockCountData)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].countedQuantity).toBe(48);
      expect(response.body[1].countedQuantity).toBe(28);
    });
  });
});