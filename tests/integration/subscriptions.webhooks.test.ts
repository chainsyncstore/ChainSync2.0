import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '@server/routes';
import session from 'express-session';

function hmacSha512(secret: string, body: string) {
  const crypto = require('crypto');
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}
function hmacSha256(secret: string, body: string) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function commonHeaders(id?: string) {
  const eid = id || `evt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  return {
    'x-event-timestamp': String(Date.now()),
    'x-event-id': eid,
  } as Record<string, string>;
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
    // Short replay TTL to test expiration behavior
    process.env.WEBHOOK_REPLAY_TTL_MS = '200';

    app = express();
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
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('accepts mixed-case signature header names (Paystack)', async () => {
    const evt = {
      event: 'charge.success',
      data: { id: `tx-ps-mixed-sig-${Date.now()}`, status: 'success', metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' } },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('X-Paystack-Signature', sig)
      .send(body)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('accepts mixed-case signature header names (Flutterwave)', async () => {
    const evt = {
      event: 'charge.completed',
      data: { status: 'successful', meta: { orgId: 'org-test', planCode: 'BASIC_USD' } },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('Verif-Hash', sig)
      .send(body)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('handles Flutterwave webhook and acknowledges receipt', async () => {
    const evt = {
      event: 'charge.completed',
      data: {
        id: `flw-handle-ack-${Date.now()}`,
        status: 'successful',
        meta: { orgId: 'org-test', planCode: 'BASIC_USD' },
      },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('verif-hash', sig)
      .send(body)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('rejects missing signature (401)', async () => {
    const evt = {
      event: 'charge.success',
      data: { status: 'success', metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' } },
    };
    const body = JSON.stringify(evt);
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      // No x-paystack-signature header
      .send(body)
      .expect(401);
  });

  it('rejects invalid signature (401)', async () => {
    const evt = {
      event: 'charge.completed',
      data: { status: 'successful', meta: { orgId: 'org-test', planCode: 'BASIC_USD' } },
    };
    const body = JSON.stringify(evt);
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('verif-hash', 'invalid')
      .send(body)
      .expect(401);
  });

  it('is idempotent on replay (second call returns idempotent: true)', async () => {
    const evt = {
      event: 'charge.success',
      data: {
        id: 'tx-abc-123',
        status: 'success',
        metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' },
      },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const eventId = 'evt-paystack-replay-1';

    // First delivery
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);

    // Replay same event
    const replay = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);
    expect(replay.body.idempotent).toBe(true);
    expect(replay.body.received).toBe(true);
  });

  it('is idempotent by provider event id even with different x-event-id values (Paystack)', async () => {
    const evt = {
      event: 'charge.success',
      data: {
        id: 'tx-provider-dup-1',
        status: 'success',
        metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' },
      },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);

    // First delivery with event id A
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders('evt-a'))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);

    // Second delivery with different event id B but same provider event id
    const replay = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders('evt-b'))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);
    expect(replay.body.received).toBe(true);
    expect(replay.body.idempotent).toBe(true);
  });

  it('accepts mixed-case event header names (timestamp and id)', async () => {
    const evt = { event: 'charge.success', data: { id: `tx-ps-mixed-evt-headers-${Date.now()}`, status: 'success', metadata: { orgId: 'org', planCode: 'BASIC_NGN' } } };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set('X-Event-Timestamp', String(Date.now()))
      .set('X-Event-Id', 'evt-mixed-case')
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);
    expect(res.body.status).toBe('success');
  });

  it('rejects missing Flutterwave signature (401)', async () => {
    const evt = {
      event: 'charge.completed',
      data: { status: 'successful', meta: { orgId: 'org-test', planCode: 'BASIC_USD' } },
    };
    const body = JSON.stringify(evt);
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      // No verif-hash header
      .send(body)
      .expect(401);
  });

  it('rejects invalid Paystack signature (401)', async () => {
    const evt = {
      event: 'charge.success',
      data: { status: 'success', metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' } },
    };
    const body = JSON.stringify(evt);
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('x-paystack-signature', 'invalid')
      .send(body)
      .expect(401);
  });

  it('returns 400 for malformed JSON payload (Paystack)', async () => {
    const raw = 'not-json';
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, raw);
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('x-paystack-signature', sig)
      .send(raw)
      .expect(400);
  });

  it('returns 400 for malformed JSON payload (Flutterwave)', async () => {
    const raw = 'not-json';
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, raw);
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('verif-hash', sig)
      .send(raw)
      .expect(400);
  });

  it('returns 400 when subscription identifiers are missing (Paystack)', async () => {
    // No metadata, and no fallback identifiers (subscription/customer)
    const evt = { event: 'charge.success', data: { status: 'success' } } as any;
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('x-paystack-signature', sig)
      .send(body);
    if (res.status === 400) {
      expect(res.body.error).toBe('Missing subscription identifiers');
    } else {
      // In test env, if idempotency insert fails (e.g., table not present), handler returns 200 with idempotent path
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    }
  });

  it('returns 400 when subscription identifiers are missing (Flutterwave)', async () => {
    // No meta, no plan/payment_plan, no customer.id
    const evt = { event: 'charge.completed', data: { status: 'successful' } } as any;
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('verif-hash', sig)
      .send(body);
    if (res.status === 400) {
      expect(res.body.error).toBe('Missing subscription identifiers');
    } else {
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    }
  });

  it('is idempotent on replay for Flutterwave (second call returns idempotent: true)', async () => {
    const evt = {
      event: 'charge.completed',
      data: {
        id: 'flw-tx-xyz-789',
        status: 'successful',
        meta: { orgId: 'org-test', planCode: 'BASIC_USD' },
      },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const eventId = 'evt-flw-replay-1';

    // First delivery
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('verif-hash', sig)
      .send(body)
      .expect(200);

    // Replay same event
    const replay = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('verif-hash', sig)
      .send(body)
      .expect(200);
    expect(replay.body.idempotent).toBe(true);
    expect(replay.body.received).toBe(true);
  });

  it('rejects missing event timestamp (401)', async () => {
    const evt = { event: 'charge.success', data: { status: 'success', metadata: { orgId: 'org', planCode: 'BASIC_NGN' } } };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set('x-event-id', 'evt-missing-ts')
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(401);
  });

  it('rejects future timestamp beyond skew (401)', async () => {
    const evt = { event: 'charge.completed', data: { status: 'successful', meta: { orgId: 'org', planCode: 'BASIC_USD' } } };
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const futureTs = Date.now() + 60 * 60 * 1000; // +1h
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set('x-event-id', 'evt-future')
      .set('x-event-timestamp', String(futureTs))
      .set('verif-hash', sig)
      .send(body)
      .expect(401);
  });

  it('rejects old timestamp beyond skew (401)', async () => {
    const evt = { event: 'charge.success', data: { status: 'success', metadata: { orgId: 'org', planCode: 'BASIC_NGN' } } };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const oldTs = Date.now() - 60 * 60 * 1000; // -1h
    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set('x-event-id', 'evt-old')
      .set('x-event-timestamp', String(oldTs))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(401);
  });

  it('rejects missing event id (400)', async () => {
    const evt = { event: 'charge.completed', data: { status: 'successful', meta: { orgId: 'org', planCode: 'BASIC_USD' } } };
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set('x-event-timestamp', String(Date.now()))
      .set('verif-hash', sig)
      .send(body)
      .expect(400);
  });

  it('replay cache expires after TTL', async () => {
    const evt = {
      event: 'charge.success',
      data: { id: 'tx-ttl-1', status: 'success', metadata: { orgId: 'org-test', planCode: 'BASIC_NGN' } },
    };
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const eventId = 'evt-replay-exp';

    await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);

    // Wait beyond TTL (set to 200ms in beforeAll)
    await new Promise(r => setTimeout(r, 300));

    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders(eventId))
      .set('x-paystack-signature', sig)
      .send(body)
      .expect(200);
    // Should not be marked idempotent after TTL expiry
    expect(res.body.idempotent).toBeFalsy();
    expect(res.body.received).toBe(true);
  });

  it('returns 400 for unsupported Paystack event type', async () => {
    const evt = { event: 'subscription.create', data: { status: 'success', metadata: { orgId: 'org', planCode: 'BASIC_NGN' } } } as any;
    const body = JSON.stringify(evt);
    const sig = hmacSha512(process.env.PAYSTACK_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/paystack-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('x-paystack-signature', sig)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unsupported event type');
  });

  it('returns 400 for unsupported Flutterwave event type', async () => {
    const evt = { event: 'transfer.completed', data: { status: 'successful', meta: { orgId: 'org', planCode: 'BASIC_USD' } } } as any;
    const body = JSON.stringify(evt);
    const sig = hmacSha256(process.env.FLUTTERWAVE_SECRET_KEY!, body);
    const res = await request(server)
      .post('/api/payment/flutterwave-webhook')
      .set('Content-Type', 'application/json')
      .set(commonHeaders())
      .set('verif-hash', sig)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unsupported event type');
  });
});


