import express from 'express';
import session from 'express-session';
import { Client } from 'pg';
import request from 'supertest';
import { GenericContainer } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Relax auth/IP middleware so we can hit POS routes directly in integration tests
const TEST_USER_ID = '00000000-0000-0000-0000-0000000000aa';
const TEST_ORG_ID = '00000000-0000-0000-0000-0000000000bb';

vi.mock('../../server/middleware/authz', () => ({
  requireAuth: () => (req: any, _res: any, next: any) => {
    req.session ??= {};
    if (!req.session.userId) req.session.userId = TEST_USER_ID;
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  enforceIpWhitelist: () => (_req: any, _res: any, next: any) => next(),
}));

const STORE_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000010';
const TEST_DEVICE_ID = 'pos-device-1';

const canRunRealDb = (() => {
  try {
    return typeof (GenericContainer as any)?.prototype?.withEnvironment === 'function';
  } catch {
    return false;
  }
})();

const describeIfSupported = canRunRealDb ? describe : describe.skip;

describeIfSupported('POS sales + offline sync contracts', () => {
  let app: express.Express;
  let server: any;
  let pgClient: Client;
  let container: any;

  beforeAll(async () => {
    const image = 'postgres:16-alpine';
    const pgUsername = 'test';
    const pgPassword = 'test';
    const pgDatabase = 'testdb';

    container = await new GenericContainer(image)
      .withEnvironment({
        POSTGRES_USER: pgUsername,
        POSTGRES_PASSWORD: pgPassword,
        POSTGRES_DB: pgDatabase,
      })
      .withExposedPorts(5432)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const url = `postgresql://${pgUsername}:${pgPassword}@${host}:${port}/${pgDatabase}`;

    process.env.DATABASE_URL = url;
    process.env.APP_URL = 'http://localhost:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'integration-test-secret';
    process.env.NODE_ENV = 'test';

    pgClient = new Client({ connectionString: url });
    await pgClient.connect();

    await pgClient.query(`
      create extension if not exists pgcrypto;
      create table if not exists organizations (
        id uuid primary key,
        name text,
        currency text,
        is_active boolean default true,
        locked_until timestamptz,
        loyalty_earn_rate numeric default 1,
        loyalty_redeem_value numeric default 0.01
      );
      create table if not exists users (
        id uuid primary key,
        org_id uuid,
        email text,
        is_admin boolean default false
      );
      create table if not exists stores (
        id uuid primary key,
        org_id uuid not null,
        name text,
        currency text default 'USD',
        tax_rate numeric default 0,
        is_active boolean default true
      );
      create table if not exists products (
        id uuid primary key,
        org_id uuid not null,
        sku text,
        name text,
        sale_price numeric,
        cost_price numeric,
        vat_rate numeric
      );
      create table if not exists inventory (
        id uuid primary key,
        store_id uuid not null,
        product_id uuid not null,
        quantity int not null default 0,
        unique (store_id, product_id)
      );
      create table if not exists customers (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null,
        phone varchar(32) not null,
        name text
      );
      create unique index if not exists customers_org_phone_unique on customers(org_id, phone);
      create table if not exists loyalty_accounts (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null,
        customer_id uuid not null,
        points int not null default 0
      );
      create unique index if not exists loyalty_accounts_customer_unique on loyalty_accounts(customer_id);
      create table if not exists loyalty_transactions (
        id uuid primary key default gen_random_uuid(),
        loyalty_account_id uuid not null,
        points int not null,
        reason varchar(255)
      );
      create table if not exists sales (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null,
        store_id uuid not null,
        cashier_id uuid not null,
        subtotal numeric,
        discount numeric,
        tax numeric,
        total numeric,
        payment_method text,
        status text default 'COMPLETED',
        occurred_at timestamptz default now(),
        idempotency_key varchar(128) unique not null
      );
      create table if not exists sale_items (
        id uuid primary key default gen_random_uuid(),
        sale_id uuid not null,
        product_id uuid not null,
        quantity int not null,
        unit_price numeric,
        line_discount numeric,
        line_total numeric
      );
      create table if not exists returns (
        id uuid primary key default gen_random_uuid(),
        sale_id uuid not null,
        reason text,
        processed_by uuid not null,
        occurred_at timestamptz default now()
      );
    `);

    await pgClient.query(
      `insert into organizations(id, name, currency, is_active, loyalty_earn_rate, loyalty_redeem_value)
        values ($1, 'Test Org', 'USD', true, 1, 0.01)
        on conflict (id) do nothing;`,
      [TEST_ORG_ID]
    );
    await pgClient.query(
      `insert into users(id, org_id, email, is_admin)
        values ($1, $2, 'cashier@test.local', false)
        on conflict (id) do nothing;`,
      [TEST_USER_ID, TEST_ORG_ID]
    );
    await pgClient.query(
      `insert into stores(id, org_id, name, currency, tax_rate, is_active)
        values ($1, $2, 'POS Test Store', 'USD', 0.05, true)
        on conflict (id) do nothing;`,
      [STORE_ID, TEST_ORG_ID]
    );
    await pgClient.query(
      `insert into products(id, org_id, sku, name, sale_price, cost_price, vat_rate)
        values ($1, $2, 'SKU-001', 'Staple Item', 25, 10, 0)
        on conflict (id) do nothing;`,
      [PRODUCT_ID, TEST_ORG_ID]
    );
    await pgClient.query(
      `insert into inventory(id, store_id, product_id, quantity)
        values ('inv-row', $1, $2, 100)
        on conflict (store_id, product_id) do update set quantity = excluded.quantity;`,
      [STORE_ID, PRODUCT_ID]
    );

    const { registerPosRoutes } = await import('../../server/api/routes.pos');
    const { registerOfflineSyncRoutes } = await import('../../server/api/routes.offline-sync');

    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'integration-test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );
    app.use((req, _res, next) => {
      req.session ??= {};
      req.session.userId ||= TEST_USER_ID;
      (req as any).orgId = TEST_ORG_ID;
      next();
    });

    await registerPosRoutes(app as any);
    await registerOfflineSyncRoutes(app as any);

    server = app.listen();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close?.(() => resolve()));
    await pgClient?.end().catch(() => undefined);
    await container?.stop().catch(() => undefined);
  });

  beforeEach(async () => {
    await pgClient.query('delete from sale_items');
    await pgClient.query('delete from sales');
    await pgClient.query('delete from returns');
    await pgClient.query('delete from loyalty_transactions');
    await pgClient.query('delete from loyalty_accounts');
    await pgClient.query('delete from customers');
    await pgClient.query(
      'update inventory set quantity = 100 where store_id = $1 and product_id = $2',
      [STORE_ID, PRODUCT_ID]
    );
  });

  it('records /api/pos/sales transactions and updates loyalty + inventory', async () => {
    const customerPhone = '08030000000';
    const payload = {
      storeId: STORE_ID,
      subtotal: '50.00',
      discount: '0',
      tax: '5.00',
      total: '55.00',
      paymentMethod: 'cash',
      customerPhone,
      redeemPoints: 0,
      items: [
        {
          productId: PRODUCT_ID,
          quantity: 2,
          unitPrice: '25.00',
          lineDiscount: '0',
          lineTotal: '50.00',
        },
      ],
    };

    const res = await request(server)
      .post('/api/pos/sales')
      .set('Idempotency-Key', `contract-test-${Date.now()}`)
      .send(payload)
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.total).toBeDefined();

    const saleRow = await pgClient.query(
      'select subtotal, tax, total, discount, status from sales where id = $1',
      [res.body.id]
    );
    expect(saleRow.rows[0].status).toBe('COMPLETED');
    expect(Number(saleRow.rows[0].total)).toBeCloseTo(55);

    const itemsCount = await pgClient.query('select count(*) from sale_items where sale_id = $1', [res.body.id]);
    expect(Number(itemsCount.rows[0].count)).toBe(1);

    const inventoryRow = await pgClient.query(
      'select quantity from inventory where store_id = $1 and product_id = $2',
      [STORE_ID, PRODUCT_ID]
    );
    expect(Number(inventoryRow.rows[0].quantity)).toBe(98);

    const loyaltyRow = await pgClient.query(
      `select la.points
       from loyalty_accounts la
       join customers c on c.id = la.customer_id
       where c.phone = $1 and c.org_id = $2`,
      [customerPhone, TEST_ORG_ID]
    );
    expect(Number(loyaltyRow.rows[0].points)).toBe(50);
  });

  it('replays offline queued sales exactly once through /api/sync/upload', async () => {
    const offlineSale = {
      id: `offline-${Date.now()}`,
      storeId: STORE_ID,
      productId: PRODUCT_ID,
      quantity: 3,
      salePrice: 10,
      discount: 0,
      tax: 0,
      paymentMethod: 'cash',
      offlineTimestamp: new Date().toISOString(),
    };

    const payload = {
      sales: [offlineSale],
      inventoryUpdates: [],
      clientInfo: {
        deviceId: TEST_DEVICE_ID,
        version: '1.0.0',
      },
    };

    const first = await request(server).post('/api/sync/upload').send(payload).expect(200);
    expect(first.body.success).toBe(true);
    expect(first.body.results.salesProcessed).toBe(1);

    const second = await request(server).post('/api/sync/upload').send(payload).expect(200);
    expect(second.body.results.salesProcessed).toBe(0);

    const saleCount = await pgClient.query(
      'select count(*) from sales where idempotency_key = $1',
      [offlineSale.id]
    );
    expect(Number(saleCount.rows[0].count)).toBe(1);

    const inventoryRow = await pgClient.query(
      'select quantity from inventory where store_id = $1 and product_id = $2',
      [STORE_ID, PRODUCT_ID]
    );
    expect(Number(inventoryRow.rows[0].quantity)).toBe(97);
  });
});
