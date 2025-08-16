import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { GenericContainer } from 'testcontainers';
import { Client } from 'pg';

// Bypass auth/IP rules in integration
vi.mock('../../server/middleware/authz', () => ({
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
  enforceIpWhitelist: () => (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

let registerRoutesFn: any;
let container: any;
let pg: Client;

// Minimal env for route registration
process.env.LOYALTY_REALDB = '1';
delete (process.env as any).BASE_URL;
process.env.APP_URL = 'http://localhost:3000';
process.env.BASE_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.SESSION_SECRET = 'integration-test-secret-123456';

describe('Loyalty earn/redeem integration', () => {
  let app: express.Express;
  let server: any;
  let storeId = '00000000-0000-0000-0000-000000000001';
  const testPhone = '08031234567';

  beforeAll(async () => {
    // Start real Postgres using Testcontainers
    const image = 'postgres:16-alpine';
    const pgUsername = 'test';
    const pgPassword = 'test';
    const pgDatabase = 'testdb';
    const started = await new GenericContainer(image)
      .withEnv('POSTGRES_USER', pgUsername)
      .withEnv('POSTGRES_PASSWORD', pgPassword)
      .withEnv('POSTGRES_DB', pgDatabase)
      .withExposedPorts(5432)
      .start();
    container = started;
    const host = started.getHost();
    const port = started.getMappedPort(5432);
    const url = `postgresql://${pgUsername}:${pgPassword}@${host}:${port}/${pgDatabase}`;
    process.env.DATABASE_URL = url;

    pg = new Client({ connectionString: url });
    await pg.connect();

    await pg.query(`
      create extension if not exists pgcrypto;
      create table if not exists stores (id uuid primary key, org_id uuid not null, name text);
      create table if not exists users (id uuid primary key, org_id uuid, email text, is_admin boolean default false);
      create table if not exists products (id uuid primary key, org_id uuid not null, sku text, name text, cost_price numeric, sale_price numeric, vat_rate numeric);
      create table if not exists inventory (id uuid primary key, store_id uuid not null, product_id uuid not null, quantity int);
      create table if not exists customers (id uuid primary key default gen_random_uuid(), org_id uuid not null, phone varchar(32) not null, name text);
      create unique index if not exists customers_org_phone_unique on customers(org_id, phone);
      create table if not exists loyalty_accounts (id uuid primary key default gen_random_uuid(), org_id uuid not null, customer_id uuid not null, points int default 0, tier varchar(64));
      create unique index if not exists loyalty_accounts_customer_unique on loyalty_accounts(customer_id);
      create table if not exists loyalty_transactions (id uuid primary key default gen_random_uuid(), loyalty_account_id uuid not null, points int not null, reason varchar(255), created_at timestamp default now());
      create table if not exists sales (id uuid primary key default gen_random_uuid(), org_id uuid not null, store_id uuid not null, cashier_id uuid not null, subtotal numeric, discount numeric, tax numeric, total numeric, payment_method text, status text default 'COMPLETED', occurred_at timestamp default now(), idempotency_key varchar(128) unique);
      create table if not exists sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid not null, product_id uuid not null, quantity int, unit_price numeric, line_discount numeric, line_total numeric);
    `);

    await pg.query(`
      insert into users(id, org_id, email, is_admin) values
        ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000bb','u@test', true)
        on conflict (id) do nothing;
      insert into stores(id, org_id, name) values
        ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000bb','Test Store')
        on conflict (id) do nothing;
      insert into products(id, org_id, sku, name, cost_price, sale_price, vat_rate) values
        ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000bb','SKU','P',0,100,0)
        on conflict (id) do nothing;
      insert into inventory(id, store_id, product_id, quantity) values
        ('inv-1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',999)
        on conflict (id) do nothing;
    `);
    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    const mod = await import('../../server/api');
    registerRoutesFn = mod.registerRoutes;
    await registerRoutesFn(app);
    server = app.listen();
  });

  afterAll(async () => {
    await pg?.end().catch(() => {});
    await container?.stop().catch(() => {});
  });

  it('creates customer by phone and earns/redeems points via POS sale', async () => {
    // Create/find customer
    const createRes = await request(server)
      .post('/api/customers')
      .send({ phone: testPhone, name: 'Test Customer', storeId })
      .expect(201);
    const customer = createRes.body;
    expect(customer.phone).toBe(testPhone);

    // Redeem 0 points initially should be fine
    const sale1 = await request(server)
      .post('/api/pos/sales')
      .set('Idempotency-Key', `test-${Date.now()}`)
      .send({
        storeId,
        subtotal: '100',
        discount: '0',
        tax: '0',
        total: '100',
        paymentMethod: 'cash',
        customerPhone: testPhone,
        redeemPoints: 0,
        items: [
          { productId: '00000000-0000-0000-0000-000000000010', quantity: 1, unitPrice: '100', lineDiscount: '0', lineTotal: '100' },
        ],
      })
      .expect(200);
    expect(sale1.body.total).toBeDefined();

    // Try redeeming more points than available should 400
    await request(server)
      .post('/api/pos/sales')
      .set('Idempotency-Key', `test-redeem-${Date.now()}`)
      .send({
        storeId,
        subtotal: '100.00',
        discount: '0',
        tax: '0',
        total: '100.00',
        paymentMethod: 'cash',
        customerPhone: testPhone,
        redeemPoints: 1000,
        items: [
          { productId: '00000000-0000-0000-0000-000000000010', quantity: 1, unitPrice: '100.00', lineDiscount: '0', lineTotal: '100.00' },
        ],
      })
      .expect(400);
  });
});


