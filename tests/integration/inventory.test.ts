import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';

import { beforeEach, describe, expect, it } from 'vitest';

import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

describe('Inventory Management Integration Tests', () => {
  let app: Express;
  let testUser: any;
  let testStore: any;
  let testProduct: any;
  let sessionCookie: string;

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
      isActive: true,
      emailVerified: true
    } as Record<string, unknown>);

    // Create test store
    testStore = await storage.createStore({
      name: 'Inventory Test Store',
      ownerId: testUser.id,
      address: 'Test Address',
      phone: '+1234567890',
      email: 'inventoryuser@example.com',
      isActive: true
    });

    // Update user with store ID
    await storage.updateUser(testUser.id, { storeId: testStore.id });

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

    // Add initial inventory for the product
    await storage.createInventory({
      productId: testProduct.id,
      storeId: testStore.id,
      quantity: 50,
      minStockLevel: 10,
      maxStockLevel: 100
    });

    // Login to get session
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'inventoryuser@example.com',
        password: 'StrongPass123!'
      });

    sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  });

  describe('PUT /api/stores/:storeId/inventory/:productId', () => {
    it('should update inventory quantity successfully', async () => {
      const updateData = {
        quantity: 75,
        adjustmentData: {
          reason: 'restock',
          notes: 'Regular restock',
          adjustedBy: testUser.id
        }
      };

      const response = await request(app)
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .set('Cookie', sessionCookie)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.quantity).toBe(75);
    });

    it('should reject negative quantities', async () => {
      const updateData = {
        quantity: -10
      };

      const response = await request(app)
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .set('Cookie', sessionCookie)
        .send(updateData)
        .expect(422);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Quantity must be a non-negative number');
    });

    it('should require authentication', async () => {
      const updateData = {
        quantity: 75
      };

      const response = await request(app)
        .put(`/api/stores/${testStore.id}/inventory/${testProduct.id}`)
        .send(updateData)
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/stores/:storeId/inventory', () => {
    beforeEach(async () => {
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

      const product3 = await storage.createProduct({
        name: 'Test Product 3',
        sku: 'INV003',
        barcode: '1234567890126',
        description: 'Third test product',
        price: 35.99,
        cost: 18.50,
        category: 'Different Category',
        brand: 'Different Brand',
        isActive: true
      });

      // Add inventory for additional products
      await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });

      await storage.createInventory({
        productId: product3.id,
        storeId: testStore.id,
        quantity: 5, // Low stock
        minStockLevel: 10,
        maxStockLevel: 50
      });
    });

    it('should return all inventory for store', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory`)
        .set('Cookie', sessionCookie)
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
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory?category=Test Category`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toMatchObject({
        storeId: testStore.id,
        currency: expect.any(String),
      });
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items.every((item: any) => 
        item.product?.category === 'Test Category'
      )).toBe(true);
    });

    it('should filter inventory by low stock', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory?lowStock=true`)
        .set('Cookie', sessionCookie)
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

      // Add low stock inventory
      await storage.createInventory({
        productId: lowStockProduct1.id,
        storeId: testStore.id,
        quantity: 5, // Below min stock level
        minStockLevel: 10,
        maxStockLevel: 50
      });

      await storage.createInventory({
        productId: lowStockProduct2.id,
        storeId: testStore.id,
        quantity: 8, // Below min stock level
        minStockLevel: 15,
        maxStockLevel: 50
      });
    });

    it('should return only low stock items', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory/low-stock`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.every((item: any) => 
        item.quantity <= item.minStockLevel
      )).toBe(true);
    });

    it('should include product details in low stock response', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory/low-stock`)
        .set('Cookie', sessionCookie)
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

      // Add inventory for additional products
      await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });

      await storage.createInventory({
        productId: product3.id,
        storeId: testStore.id,
        quantity: 20,
        minStockLevel: 10,
        maxStockLevel: 50
      });
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

      const response = await request(app)
        .post(`/api/stores/${testStore.id}/inventory/bulk-update`)
        .set('Cookie', sessionCookie)
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

      const response = await request(app)
        .post(`/api/stores/${testStore.id}/inventory/bulk-update`)
        .set('Cookie', sessionCookie)
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('Updates must be an array');
    });
  });

  describe('GET /api/stores/:storeId/inventory/stock-movements', () => {
    beforeEach(async () => {
      // Create some stock movements by updating inventory
      await storage.updateInventory(testProduct.id, testStore.id, { quantity: 60 });
      await storage.updateInventory(testProduct.id, testStore.id, { quantity: 45 });
      await storage.updateInventory(testProduct.id, testStore.id, { quantity: 70 });
    });

    it('should return stock movement history', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory/stock-movements`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]?.productId).toBeDefined();
      expect(response.body[0]?.quantity).toBeDefined();
      expect(response.body[0]?.timestamp).toBeDefined();
    });

    it('should filter stock movements by product', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/inventory/stock-movements?productId=${testProduct.id}`)
        .set('Cookie', sessionCookie)
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

      const response = await request(app)
        .post(`/api/stores/${testStore.id}/inventory/stock-count`)
        .set('Cookie', sessionCookie)
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

      await storage.createInventory({
        productId: product2.id,
        storeId: testStore.id,
        quantity: 30,
        minStockLevel: 5,
        maxStockLevel: 50
      });

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

      const response = await request(app)
        .post(`/api/stores/${testStore.id}/inventory/stock-count`)
        .set('Cookie', sessionCookie)
        .send(stockCountData)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].countedQuantity).toBe(48);
      expect(response.body[1].countedQuantity).toBe(28);
    });
  });
}); 