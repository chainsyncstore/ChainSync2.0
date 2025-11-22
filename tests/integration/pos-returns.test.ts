import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';

import { beforeEach, describe, expect, it } from 'vitest';

import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

describe('POS Returns API', () => {
  let app: Express;
  let sessionCookie: string;
  let testUser: any;
  let testStore: any;
  let testProduct: any;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    await registerRoutes(app);

    testUser = await storage.createUser({
      username: 'returns-user@example.com',
      password: 'StrongPass123!',
      email: 'returns-user@example.com',
      firstName: 'Returns',
      lastName: 'Tester',
      role: 'cashier',
      isActive: true,
      emailVerified: true,
    } as Record<string, unknown>);

    testStore = await storage.createStore({
      name: 'Returns Test Store',
      ownerId: testUser.id,
      address: '123 Test Way',
      phone: '+1234567890',
      email: 'returns-user@example.com',
      isActive: true,
    });
    await storage.updateUser(testUser.id, { storeId: testStore.id });

    testProduct = await storage.createProduct({
      name: 'Returnable Widget',
      sku: 'RET-001',
      barcode: '3216549870987',
      description: 'Widget for returns testing',
      price: 10,
      cost: 4,
      category: 'QA',
      brand: 'Cascade',
      isActive: true,
    });

    await storage.createInventory({
      productId: testProduct.id,
      storeId: testStore.id,
      quantity: 20,
      minStockLevel: 5,
      maxStockLevel: 200,
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'returns-user@example.com', password: 'StrongPass123!' });
    sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  });

  async function createSale(quantity: number = 2) {
    const salePayload = {
      storeId: testStore.id,
      subtotal: String((10 * quantity).toFixed(2)),
      discount: '0',
      tax: '0',
      total: String((10 * quantity).toFixed(2)),
      paymentMethod: 'cash',
      items: [
        {
          productId: testProduct.id,
          quantity,
          unitPrice: '10.00',
          lineDiscount: '0',
          lineTotal: String((10 * quantity).toFixed(2)),
        },
      ],
    };

    const res = await request(app)
      .post('/api/pos/sales')
      .set('Cookie', sessionCookie)
      .set('Idempotency-Key', `sale-${Date.now()}`)
      .send(salePayload)
      .expect(200);

    return res.body;
  }

  it('creates a return, lists it, and exposes detail with restock/refund metadata', async () => {
    const sale = await createSale(2);

    const returnPayload = {
      saleId: sale.id,
      storeId: testStore.id,
      reason: 'Damaged on delivery',
      items: [
        {
          productId: testProduct.id,
          quantity: 1,
          restockAction: 'RESTOCK',
          refundType: 'PARTIAL',
          refundAmount: '5.00',
        },
        {
          productId: testProduct.id,
          quantity: 1,
          restockAction: 'DISCARD',
          refundType: 'FULL',
        },
      ],
    };

    const returnResponse = await request(app)
      .post('/api/pos/returns')
      .set('Cookie', sessionCookie)
      .send(returnPayload)
      .expect(201);

    expect(returnResponse.body.ok).toBe(true);
    expect(returnResponse.body.return.currency).toBe('USD');
    expect(returnResponse.body.return.refundType).toBe('PARTIAL');
    expect(Number(returnResponse.body.return.totalRefund)).toBeCloseTo(15);
    expect(returnResponse.body.items).toHaveLength(2);
    const [restockItem, discardItem] = returnResponse.body.items;
    expect(restockItem.restockAction).toBe('RESTOCK');
    expect(restockItem.refundType).toBe('PARTIAL');
    expect(discardItem.restockAction).toBe('DISCARD');
    expect(discardItem.refundType).toBe('FULL');

    const listResponse = await request(app)
      .get('/api/pos/returns')
      .query({ storeId: testStore.id })
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].saleId).toBe(sale.id);

    const detailResponse = await request(app)
      .get(`/api/pos/returns/${returnResponse.body.return.id}`)
      .query({ storeId: testStore.id })
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(detailResponse.body.return.id).toBe(returnResponse.body.return.id);
    expect(detailResponse.body.items).toHaveLength(2);
    const detailRestock = detailResponse.body.items.find((it: any) => it.restockAction === 'RESTOCK');
    expect(detailRestock.currency).toBe('USD');
    expect(Number(detailRestock.refundAmount)).toBeCloseTo(5);

    const inventory = await storage.getInventory(testProduct.id, testStore.id);
    expect(inventory.quantity).toBe(19); // started at 20, sold 2 (down to 18), restocked 1 => 19
  });
});
