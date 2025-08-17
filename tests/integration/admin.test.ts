import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';

// Bypass IP checks and auth for tests via NODE_ENV=test inside middlewares
vi.mock('../../server/middleware/authz', async () => {
  const mod = await vi.importActual<any>('../../server/middleware/authz');
  return { ...mod, enforceIpWhitelist: (_req: any, _res: any, next: any) => next(), requireAuth: (_req: any, _res: any, next: any) => next(), requireRole: () => (_req: any, _res: any, next: any) => next() };
});

let app: express.Express;
let server: any;

describe('Admin routes', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.BASE_URL = 'http://localhost:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'integration-test-secret-123456';
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    // Seed a fake session user id so route code can read it
    app.use((req, _res, next) => { (req.session as any).userId = 'u-test'; next(); });
    const mod = await import('../../server/api');
    await mod.registerRoutes(app);
    server = app.listen();
  });

  afterAll(async () => {
    server?.close();
  });

  it('can list users and create/delete a user', async () => {
    // list
    const listRes = await request(server).get('/api/admin/users').expect(200);
    expect(Array.isArray(listRes.body.users)).toBe(true);

    // create
    const email = `test-${Date.now()}@example.com`;
    const createRes = await request(server).post('/api/admin/users').send({ email, password: 'Password123!' }).expect(201);
    expect(createRes.body.email).toBe(email);

    // delete
    const id = createRes.body.id;
    await request(server).delete(`/api/admin/users/${id}`).expect(204);
  }, 20000);

  it('can manage IP whitelist entries', async () => {
    const addRes = await request(server).post('/api/admin/ip-whitelist').send({ role: 'CASHIER', cidrOrIp: '127.0.0.1', label: 'local' }).expect(201);
    expect(addRes.body.cidrOrIp).toBe('127.0.0.1');
    const id = addRes.body.id;
    await request(server).get('/api/admin/ip-whitelist').expect(200);
    await request(server).delete(`/api/admin/ip-whitelist/${id}`).expect(204);
  }, 20000);

  it('bulk pricing dry-run and apply are idempotent', async () => {
    const preview = await request(server).post('/api/admin/bulk-pricing/apply').set('Idempotency-Key', 'test-key').send({ type: 'percentage', value: '0', dryRun: true }).expect(200);
    expect(Array.isArray(preview.body.changes)).toBe(true);
    const apply = await request(server).post('/api/admin/bulk-pricing/apply').set('Idempotency-Key', 'test-key').send({ type: 'percentage', value: '0' }).expect(200);
    expect(apply.body.idempotent || typeof apply.body.applied === 'number').toBeTruthy();
  }, 20000);
});


