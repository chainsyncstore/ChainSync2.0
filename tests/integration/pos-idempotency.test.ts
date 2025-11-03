import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { registerPosRoutes } from '../../server/api/routes.pos';

describe('POS Sales Idempotency', () => {
  it('should return same sale for duplicate Idempotency-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    await registerPosRoutes(app as any);

    const payload = {
      storeId: '00000000-0000-0000-0000-000000000001',
      subtotal: '10.00',
      discount: '0',
      tax: '0.85',
      total: '10.85',
      paymentMethod: 'cash',
      items: [
        { productId: '00000000-0000-0000-0000-000000000010', quantity: 1, unitPrice: '10.00', lineDiscount: '0', lineTotal: '10.00' },
      ],
    } as any;

    const key = `test-idemp-${Date.now()}`;

    const res1 = await request(app)
      .post('/api/pos/sales')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect((r) => [200, 201].includes(r.status));

    const res2 = await request(app)
      .post('/api/pos/sales')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);

    expect(res2.body.id).toBe(res1.body.id);
  });
});


