import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { organizations, stores as storesTbl, users as usersTbl, sales as salesTbl } from '@shared/prd-schema';
import { registerAnalyticsRoutes } from '../../server/api/routes.analytics';
import { db } from '../../server/db';

type Agent = ReturnType<typeof request.agent>;

describe('Analytics Integration', () => {
  let app: Express;
  let server: any;
  let agent: Agent;
  let orgId: string = '';
  let storeId: string = '';
  let userId: string = '';

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, cookie: { secure: false } }));

    // Seed minimal org/user/store/sales
    const [org] = await db.insert(organizations).values({ name: 'Test Org', currency: 'NGN' } as any).returning();
    orgId = org.id as any;
    const [store] = await db.insert(storesTbl).values({ orgId, name: 'Main' } as any).returning();
    storeId = store.id as any;
    const [user] = await db.insert(usersTbl).values({ orgId, email: 'analytics@example.com', passwordHash: 'x', isAdmin: true, emailVerified: true } as any).returning();
    userId = user.id as any;

    // Auth stub: set userId on every request now that it is known
    app.use((req: any, _res, next) => { req.session.userId = userId; next(); });

    await registerAnalyticsRoutes(app);
    server = app.listen(0);
    agent = request.agent(server);

    // Insert a few sales in range
    const now = new Date();
    const day1 = new Date(now.getTime() - 2 * 86400000);
    const day2 = new Date(now.getTime() - 1 * 86400000);
    await db.insert(salesTbl).values({ orgId, storeId, cashierId: userId, subtotal: '100', discount: '0', tax: '5', total: '105', paymentMethod: 'cash', status: 'COMPLETED', occurredAt: day1 as any, idempotencyKey: 'idemp-1' } as any).returning();
    await db.insert(salesTbl).values({ orgId, storeId, cashierId: userId, subtotal: '200', discount: '0', tax: '10', total: '210', paymentMethod: 'cash', status: 'COMPLETED', occurredAt: day2 as any, idempotencyKey: 'idemp-2' } as any).returning();
  });

  afterAll(async () => {
    if (server) server.close();
  });

  it('GET /api/analytics/overview returns money totals with normalization', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 86400000);
    const res = await agent
      .get(`/api/analytics/overview?store_id=${storeId}&date_from=${start.toISOString()}&date_to=${end.toISOString()}&normalize_currency=true`)
      .expect(200);
    expect(res.body.total).toMatchObject({
      amount: expect.any(Number),
      currency: "NGN",
    });
    expect(res.body.total.amount).toBeCloseTo(315, 2);
    expect(res.body.normalized).toMatchObject({
      amount: expect.any(Number),
      currency: "NGN",
      baseCurrency: "NGN",
    });
    expect(res.body.transactions).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/analytics/timeseries day interval returns normalized money buckets', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 86400000);
    const res = await agent
      .get(`/api/analytics/timeseries?interval=day&store_id=${storeId}&date_from=${start.toISOString()}&date_to=${end.toISOString()}&normalize_currency=true`)
      .expect(200);
    expect(res.body).toMatchObject({ baseCurrency: "NGN", points: expect.any(Array) });
    expect(res.body.points.length).toBeGreaterThan(0);
    const firstPoint = res.body.points[0];
    expect(firstPoint.date).toBeDefined();
    expect(firstPoint.total).toMatchObject({ amount: expect.any(Number), currency: "NGN" });
    expect(firstPoint.normalized).toMatchObject({
      amount: expect.any(Number),
      currency: "NGN",
      baseCurrency: "NGN",
    });
    expect(firstPoint.transactions).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/analytics/export.csv returns CSV', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 86400000);
    const res = await agent
      .get(`/api/analytics/export.csv?interval=day&store_id=${storeId}&date_from=${start.toISOString()}&date_to=${end.toISOString()}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toContain('date,revenue');
  });

  it('GET /api/analytics/export.pdf returns PDF', async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 86400000);
    const res = await agent
      .get(`/api/analytics/export.pdf?interval=day&store_id=${storeId}&date_from=${start.toISOString()}&date_to=${end.toISOString()}`)
      .buffer()
      .parse((res, cb) => {
        const data: any[] = []; res.on('data', (chunk) => data.push(chunk)); res.on('end', () => cb(null, Buffer.concat(data))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).byteLength).toBeGreaterThan(1000);
  });
});


