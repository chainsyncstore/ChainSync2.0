import dotenv from 'dotenv';

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import {
  stores as T_STORES,
  products as T_PRODUCTS,
  inventory as T_INVENTORY,
  customers as T_CUSTOMERS,
  loyaltyAccounts as T_LA,
  loyaltyTransactions as T_LT,
  sales as T_SALES,
  saleItems as T_SALE_ITEMS,
  auditLogs as T_AUDIT,
} from '../../shared/prd-schema';
import {
  users as T_USERS,
  userRoles as T_USER_ROLES,
  subscriptions as T_SUBSCRIPTIONS,
  subscriptionPayments as T_SUBSCRIPTION_PAYMENTS,
} from '../../shared/schema';
import { cryptoModuleMock } from '../utils/crypto-mocks';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock database with deterministic in-memory fixtures compatible with our API routes
if (process.env.LOYALTY_REALDB !== '1') {
  vi.mock('../../server/db', () => {
    type Row = Record<string, any>;
    const store: Record<string, Row[]> = {
      users: [],
      user_roles: [],
      stores: [],
      subscriptions: [],
      subscription_payments: [],
      products: [],
      inventory: [],
      customers: [],
      loyalty_accounts: [],
      loyalty_transactions: [],
      sales: [],
      sale_items: [],
      audit_logs: [],
    };

    function tableName(t: any): keyof typeof store {
      if (t === T_USERS) return 'users';
      if (t === T_USER_ROLES) return 'user_roles';
      if (t === T_STORES) return 'stores';
      if (t === T_PRODUCTS) return 'products';
      if (t === T_INVENTORY) return 'inventory';
      if (t === T_CUSTOMERS) return 'customers';
      if (t === T_LA) return 'loyalty_accounts';
      if (t === T_LT) return 'loyalty_transactions';
      if (t === T_SALES) return 'sales';
      if (t === T_SALE_ITEMS) return 'sale_items';
      if (t === T_AUDIT) return 'audit_logs';
      if (t === T_SUBSCRIPTIONS) return 'subscriptions';
      if (t === T_SUBSCRIPTION_PAYMENTS) return 'subscription_payments';
      return 'audit_logs';
    }

    function genId(prefix: string) {
      return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    }

    const toCamel = (name: string) => name.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

    const select = vi.fn(() => ({
      from: (tbl: any) => {
        const key = tableName(tbl);
        const rows = store[key] || [];
        const result = rows.slice();

        const thenable = (res: any[]) => ({
          limit: (n: number) => Promise.resolve(res.slice(0, n)),
          then: (resolve: any) => resolve(res),
        });

        return {
          innerJoin: () => this,
          leftJoin: () => this,
          orderBy: () => this,
          groupBy: () => this,
          where: (expr?: any) => {
            if (expr && expr.right && expr.left) {
              const candidates = new Set<string>();
              const rawName = expr.left.name || expr.left.column;
              if (typeof rawName === 'string') {
                candidates.add(rawName);
                const parts = rawName.split('.');
                candidates.add(parts[parts.length - 1]);
              }
              if (expr.left.column) candidates.add(expr.left.column);
              if (expr.left.key) candidates.add(expr.left.key);
              const camelCandidates = Array.from(candidates).map(name => toCamel(name));
              const value = expr.right;
              const filtered = result.filter(row => {
                return camelCandidates.some(col => row[col] === value || row[col] === String(value));
              });
              return thenable(filtered);
            }
            return thenable(result);
          },
          limit: async (n?: number) => (n ? result.slice(0, n) : result),
          then: (resolve: any) => resolve(result),
        } as any;
      },
    }));

    const insert = vi.fn((tbl?: any) => ({
      values: (obj: any) => ({
        returning: async () => {
          const key = tableName(tbl);
          const row = { id: obj.id || genId(key), ...obj } as Row;
          store[key].push(row);
          return [row];
        },
      }),
    }));

    const update = vi.fn((tbl?: any) => ({
      set: (partial: any) => ({
        where: () => ({
          returning: async () => {
            const key = tableName(tbl);
            const target = store[key][store[key].length - 1];
            Object.assign(target || {}, partial);
            return [target];
          },
        }),
      }),
    }));

    const _db: Record<string, any> = {
      select,
      insert,
      update,
      delete: vi.fn(),
      execute: vi.fn(async (query: string) => {
        void query;
        return [];
      }),
    };

    function seed(fixtures: Partial<Record<keyof typeof store, Row[]>>) {
      for (const k of Object.keys(store) as (keyof typeof store)[]) {
        store[k] = fixtures[k]?.slice() || [];
      }
    }

    function reset() {
      seed({});
    }

    return {
      db: _db,
      checkDatabaseHealth: vi.fn().mockResolvedValue(true),
      __seed: seed,
      __reset: reset,
    };
  });
}

// Mock crypto module for integration tests
vi.mock('crypto', () => cryptoModuleMock);

// Mock security middleware to bypass CSRF in tests
vi.mock('../../server/middleware/security', async () => {
  const mod = await vi.importActual<any>('../../server/middleware/security');
  return {
    ...mod,
    csrfProtection: (_req: any, _res: any, next: any) => next(),
  };
});

type TestDbMock = {
  end?(): Promise<unknown>;
  [key: string]: any;
};

let testDb: TestDbMock | null = null;

const originalConsoleMethods = {
  log: console.log,
  error: console.error,
  warn: console.warn,
};

async function clearTestData() {
  if (!testDb) {
    return;
  }

  const db = testDb;
  const tables = [
    'ip_whitelist_logs',
    'ip_whitelists',
    'password_reset_tokens',
    'loyalty_transactions',
    'transaction_items',
    'transactions',
    'subscription_payments',
    'subscriptions',
    'low_stock_alerts',
    'inventory',
    'products',
    'loyalty_tiers',
    'user_roles',
    'customers',
    'user_store_permissions',
    'users',
    'stores',
  ];

  try {
    for (const table of tables) {
      try {
        await db.execute(`DELETE FROM ${table}`);
      } catch {
        /* no-op */
      }
    }
  } catch (error) {
    console.warn('Error clearing test data:', error);
  }

  if (process.env.LOYALTY_REALDB !== '1') {
    try {
      const dbmod: any = await import('../../server/db');
      const reset = dbmod.__reset as () => void;
      reset();
    } catch {
      /* no-op */
    }
  }
}

beforeAll(async () => {
  console.log('Setting up integration test environment...');

  if (!process.env.DATABASE_URL?.includes('test')) {
    console.warn('Warning: Integration tests should use a test database');
  }

  try {
    testDb = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      execute: vi.fn(async (query: string) => {
        void query;
        return [];
      }),
      end: vi.fn(async () => undefined),
    };

    await (testDb as any).execute('SELECT 1');
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw new Error('Integration tests require a working database connection');
  }

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterAll(async () => {
  console.log('Cleaning up integration test environment...');

  if (testDb && typeof testDb.end === 'function') {
    try {
      await testDb.end();
    } catch (error) {
      console.warn('Error closing database connection:', error);
    }
  }

  testDb = null;

  console.log = originalConsoleMethods.log;
  console.error = originalConsoleMethods.error;
  console.warn = originalConsoleMethods.warn;
});

beforeEach(async () => {
  await clearTestData();

  try {
    if (process.env.LOYALTY_REALDB !== '1') {
      const dbmod: any = await import('../../server/db');
      const seed = dbmod.__seed as typeof dbmod.__seed;
      seed({
        users: [{ id: 'u-test', orgId: 'org-test', email: 'user@test', isAdmin: true }],
        stores: [{ id: '00000000-0000-0000-0000-000000000001', orgId: 'org-test', name: 'Test Store' }],
        products: [{ id: '00000000-0000-0000-0000-000000000010', orgId: 'org-test', sku: 'SKU', name: 'P', costPrice: '0', salePrice: '100', vatRate: '0' }],
        inventory: [{ id: 'inv-1', storeId: '00000000-0000-0000-0000-000000000001', productId: '00000000-0000-0000-0000-000000000010', quantity: 999 }],
      });
    }
  } catch {
    /* no-op */
  }
});

afterEach(async () => {
  await clearTestData();
});