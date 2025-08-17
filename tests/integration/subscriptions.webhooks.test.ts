import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '@server/routes';
import session from 'express-session';

function hmacSha512(secret: string, body: string) {
  const crypto = require('crypto');
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

describe('Subscriptions Webhooks', () => {
  let app: express.Express;
  let server: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.BASE_URL = 'http://localhost:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'integration-test-secret-123456';
    process.env.PAYSTACK_SECRET_KEY = 'ps_test_secret';
    process.env.FLUTTERWAVE_SECRET_KEY = 'flw_test_secret';

    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    await registerRoutes(app as any);
    server = app.listen();
  });

  afterAll(async () => {
    server?.close();
  });

  it('handles Paystack webhook and acknowledges receipt', async () => {
    const evt = {
      event: 'charge.success',
      data: {
        status: 'success',
        metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' },
      },
    };
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, JSON.stringify(evt));
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(evt)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('handles Flutterwave webhook and acknowledges receipt', async () => {
    const evt = {
      event: 'charge.completed',
      data: {
        status: 'successful',
        meta: { orgId: 'org-test', planCode: 'BASIC_USD' },
      },
    };
    const res = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      // Legacy handler expects secret directly in verif-hash header
      .set('verif-hash', process.env.FLUTTERWAVE_SECRET_KEY as string)
      .send(evt)
      .expect(200);
    expect(res.body.status).toBe('success');
  });
});


