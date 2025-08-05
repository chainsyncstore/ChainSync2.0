import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

describe('POS Transaction Integration Tests', () => {
  let app: express.Application;
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
      username: 'posuser@example.com',
      password: 'StrongPass123!',
      email: 'posuser@example.com',
      firstName: 'POS',
      lastName: 'User',
      phone: '+1234567890',
      companyName: 'POS Test Company',
      role: 'cashier',
      tier: 'basic',
      location: 'Test Location',
      isActive: true
    });

    // Create test store
    testStore = await storage.createStore({
      name: 'POS Test Store',
      ownerId: testUser.id,
      address: 'Test Address',
      phone: '+1234567890',
      email: 'posuser@example.com',
      isActive: true
    });

    // Update user with store ID
    await storage.updateUser(testUser.id, { storeId: testStore.id });

    // Create test product
    testProduct = await storage.createProduct({
      name: 'Test Product',
      sku: 'TEST001',
      barcode: '1234567890123',
      description: 'A test product for POS testing',
      price: 10.99,
      cost: 5.50,
      category: 'Test Category',
      brand: 'Test Brand',
      isActive: true
    });

    // Add inventory for the product
    await storage.createInventory({
      productId: testProduct.id,
      storeId: testStore.id,
      quantity: 100,
      minStockLevel: 10,
      maxStockLevel: 200
    });

    // Login to get session
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'posuser@example.com',
        password: 'StrongPass123!'
      });

    sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  });

  describe('POST /api/transactions', () => {
    it('should create a new transaction successfully', async () => {
      const transactionData = {
        storeId: testStore.id,
        customerId: null,
        status: 'pending',
        paymentMethod: 'cash',
        subtotal: 10.99,
        taxAmount: 0.93,
        totalAmount: 11.92,
        notes: 'Test transaction'
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Cookie', sessionCookie)
        .send(transactionData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.storeId).toBe(testStore.id);
      expect(response.body.status).toBe('pending');
      expect(response.body.totalAmount).toBe(11.92);
      expect(response.body).toHaveProperty('receiptNumber');
    });

    it('should reject invalid transaction data', async () => {
      const invalidData = {
        storeId: testStore.id,
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Cookie', sessionCookie)
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('Invalid transaction data');
    });

    it('should require authentication', async () => {
      const transactionData = {
        storeId: testStore.id,
        status: 'pending',
        paymentMethod: 'cash',
        subtotal: 10.99,
        taxAmount: 0.93,
        totalAmount: 11.92
      };

      const response = await request(app)
        .post('/api/transactions')
        .send(transactionData)
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/transactions/:transactionId/items', () => {
    let testTransaction: any;

    beforeEach(async () => {
      testTransaction = await storage.createTransaction({
        storeId: testStore.id,
        customerId: null,
        status: 'pending',
        paymentMethod: 'cash',
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        notes: 'Test transaction for items'
      });
    });

    it('should add item to transaction successfully', async () => {
      const itemData = {
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 2,
        unitPrice: 10.99,
        totalPrice: 21.98,
        storeId: testStore.id
      };

      const response = await request(app)
        .post(`/api/transactions/${testTransaction.id}/items`)
        .set('Cookie', sessionCookie)
        .send(itemData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.productId).toBe(testProduct.id);
      expect(response.body.quantity).toBe(2);
      expect(response.body.totalPrice).toBe(21.98);
    });

    it('should update inventory when adding items', async () => {
      const initialInventory = await storage.getInventory(testProduct.id, testStore.id);
      const initialQuantity = initialInventory.quantity;

      const itemData = {
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 5,
        unitPrice: 10.99,
        totalPrice: 54.95,
        storeId: testStore.id
      };

      await request(app)
        .post(`/api/transactions/${testTransaction.id}/items`)
        .set('Cookie', sessionCookie)
        .send(itemData)
        .expect(201);

      const updatedInventory = await storage.getInventory(testProduct.id, testStore.id);
      expect(updatedInventory.quantity).toBe(initialQuantity - 5);
    });

    it('should reject adding more items than available inventory', async () => {
      const itemData = {
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 150, // More than available inventory (100)
        unitPrice: 10.99,
        totalPrice: 1648.50,
        storeId: testStore.id
      };

      const response = await request(app)
        .post(`/api/transactions/${testTransaction.id}/items`)
        .set('Cookie', sessionCookie)
        .send(itemData)
        .expect(400);

      expect(response.body.message).toContain('insufficient inventory');
    });
  });

  describe('PUT /api/transactions/:transactionId/complete', () => {
    let testTransaction: any;

    beforeEach(async () => {
      testTransaction = await storage.createTransaction({
        storeId: testStore.id,
        customerId: null,
        status: 'pending',
        paymentMethod: 'cash',
        subtotal: 21.98,
        taxAmount: 1.87,
        totalAmount: 23.85,
        notes: 'Test transaction to complete'
      });

      // Add an item to the transaction
      await storage.addTransactionItem({
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 2,
        unitPrice: 10.99,
        totalPrice: 21.98,
        storeId: testStore.id
      });
    });

    it('should complete transaction successfully', async () => {
      const response = await request(app)
        .put(`/api/transactions/${testTransaction.id}/complete`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body).toHaveProperty('completedAt');
    });

    it('should reject completing non-existent transaction', async () => {
      const response = await request(app)
        .put('/api/transactions/non-existent-id/complete')
        .set('Cookie', sessionCookie)
        .expect(500);

      expect(response.body.message).toBe('Failed to complete transaction');
    });
  });

  describe('PUT /api/transactions/:transactionId/void', () => {
    let testTransaction: any;

    beforeEach(async () => {
      testTransaction = await storage.createTransaction({
        storeId: testStore.id,
        customerId: null,
        status: 'pending',
        paymentMethod: 'cash',
        subtotal: 21.98,
        taxAmount: 1.87,
        totalAmount: 23.85,
        notes: 'Test transaction to void'
      });

      // Add an item to the transaction
      await storage.addTransactionItem({
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 2,
        unitPrice: 10.99,
        totalPrice: 21.98,
        storeId: testStore.id
      });
    });

    it('should void transaction and restore inventory', async () => {
      const initialInventory = await storage.getInventory(testProduct.id, testStore.id);
      const initialQuantity = initialInventory.quantity;

      const response = await request(app)
        .put(`/api/transactions/${testTransaction.id}/void`)
        .set('Cookie', sessionCookie)
        .send({ storeId: testStore.id })
        .expect(200);

      expect(response.body.status).toBe('voided');

      // Check that inventory was restored
      const updatedInventory = await storage.getInventory(testProduct.id, testStore.id);
      expect(updatedInventory.quantity).toBe(initialQuantity + 2);
    });
  });

  describe('GET /api/stores/:storeId/transactions', () => {
    beforeEach(async () => {
      // Create multiple test transactions
      for (let i = 0; i < 3; i++) {
        await storage.createTransaction({
          storeId: testStore.id,
          customerId: null,
          status: 'completed',
          paymentMethod: 'cash',
          subtotal: 10.99,
          taxAmount: 0.93,
          totalAmount: 11.92,
          notes: `Test transaction ${i + 1}`,
          completedAt: new Date()
        });
      }
    });

    it('should return paginated transactions for store', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/transactions?page=1&limit=2`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter transactions by status', async () => {
      const response = await request(app)
        .get(`/api/stores/${testStore.id}/transactions?status=completed`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body.data.every((t: any) => t.status === 'completed')).toBe(true);
    });
  });

  describe('GET /api/transactions/:id', () => {
    let testTransaction: any;

    beforeEach(async () => {
      testTransaction = await storage.createTransaction({
        storeId: testStore.id,
        customerId: null,
        status: 'completed',
        paymentMethod: 'cash',
        subtotal: 21.98,
        taxAmount: 1.87,
        totalAmount: 23.85,
        notes: 'Test transaction for details',
        completedAt: new Date()
      });

      // Add items to the transaction
      await storage.addTransactionItem({
        transactionId: testTransaction.id,
        productId: testProduct.id,
        quantity: 2,
        unitPrice: 10.99,
        totalPrice: 21.98,
        storeId: testStore.id
      });
    });

    it('should return transaction with items', async () => {
      const response = await request(app)
        .get(`/api/transactions/${testTransaction.id}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('id', testTransaction.id);
      expect(response.body).toHaveProperty('items');
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].productId).toBe(testProduct.id);
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .get('/api/transactions/non-existent-id')
        .set('Cookie', sessionCookie)
        .expect(404);

      expect(response.body.message).toBe('Transaction not found');
    });
  });
}); 