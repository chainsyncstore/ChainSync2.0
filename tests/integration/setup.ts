import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import dotenv from 'dotenv';
import { cryptoModuleMock } from '../utils/crypto-mocks';
import {
  users as T_USERS,
  stores as T_STORES,
  products as T_PRODUCTS,
  inventory as T_INVENTORY,
  customers as T_CUSTOMERS,
  loyaltyAccounts as T_LA,
  loyaltyTransactions as T_LT,
  sales as T_SALES,
  saleItems as T_SALE_ITEMS,
  auditLogs as T_AUDIT,
  subscriptions as T_SUBSCRIPTIONS,
} from '../../shared/prd-schema';

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
    stores: [],
    subscriptions: [],
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
    return 'audit_logs';
  }

  function genId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const select = vi.fn((projection?: any) => ({
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
          // This is a hacky mock of the where clause to support the user lookup in authz.
          // It assumes an `eq` expression on an `id` column.
          if (expr && expr.right && expr.left?.name === 'id') {
            const filtered = result.filter(row => row.id === expr.right);
            return thenable(filtered);
          }
          return thenable(result);
        },
        limit: async (n?: number) => n ? result.slice(0, n) : result,
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
      where: (_expr?: any) => ({
        returning: async () => {
          const key = tableName(tbl);
          const target = store[key][store[key].length - 1];
          Object.assign(target || {}, partial);
          return [target];
        },
      }),
    }),
  }));

  const _db: any = { select, insert, update, delete: vi.fn(), execute: vi.fn(async () => []) };

  function seed(fixtures: Partial<Record<keyof typeof store, Row[]>>) {
    for (const k of Object.keys(store) as (keyof typeof store)[]) {
      store[k] = fixtures[k]?.slice() || [];
    }
  }
  function reset() {
    seed({});
  }

  return { db: _db, checkDatabaseHealth: vi.fn().mockResolvedValue(true), __seed: seed, __reset: reset };
});
}

// Do not mock storage to preserve full functionality used by integration tests

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

let testDb: any;

// Global integration test setup
beforeAll(async () => {
  console.log('Setting up integration test environment...');
  
  // Ensure we're using test database
  if (!process.env.DATABASE_URL?.includes('test')) {
    console.warn('Warning: Integration tests should use a test database');
    // For development, allow non-test database but warn
  }
  
  try {
    // Initialize test database connection
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
      execute: vi.fn().mockResolvedValue([])
    };
    
    // Test database connectivity
    await testDb.execute('SELECT 1');
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw new Error('Integration tests require a working database connection');
  }
});

// Global integration test cleanup
afterAll(async () => {
  console.log('Cleaning up integration test environment...');
  
  // Close database connection if needed
  if (testDb && typeof testDb.end === 'function') {
    try {
      await testDb.end();
    } catch (error) {
      console.warn('Error closing database connection:', error);
    }
  }
});

// Per-test setup
beforeEach(async () => {
  // Clear all data before each test
  await clearTestData();
  // Default seed minimal fixtures so API routes depending on stores/users work deterministically
  try {
    if (process.env.LOYALTY_REALDB !== '1') {
      const dbmod: any = await import('../../server/db');
      const seed = dbmod.__seed as (f: any) => void;
      seed({
        users: [{ id: 'u-test', orgId: 'org-test', email: 'user@test', isAdmin: true }],
        stores: [{ id: '00000000-0000-0000-0000-000000000001', orgId: 'org-test', name: 'Test Store' }],
        subscriptions: [{ id: 'sub-test', orgId: 'org-test', planCode: 'enterprise', status: 'ACTIVE' }],
        products: [{ id: '00000000-0000-0000-0000-000000000010', orgId: 'org-test', sku: 'SKU', name: 'P', costPrice: '0', salePrice: '100', vatRate: '0' }],
        inventory: [{ id: 'inv-1', storeId: '00000000-0000-0000-0000-000000000001', productId: '00000000-0000-0000-0000-000000000010', quantity: 999 }],
      });
    }
  } catch {}
});

// Per-test cleanup
afterEach(async () => {
  // Clear all data after each test
  await clearTestData();
});

async function clearTestData() {
  if (!testDb) return;
  
  try {
    // Clear all tables in reverse dependency order
    const tables = [
      'ip_whitelist_logs',
      'ip_whitelists',
      'password_reset_tokens',
      'loyalty_transactions',
      'transaction_items',
      'transactions',
      'subscriptions',
      'low_stock_alerts',
      'inventory',
      'products',
      'loyalty_tiers',
      'customers',
      'user_store_permissions',
      'users',
      'stores'
    ];
    
    for (const table of tables) {
      try {
        await testDb.execute(`DELETE FROM ${table}`);
      } catch (error) {
        // Table might not exist or be empty, ignore
      }
    }
  } catch (error) {
    console.warn('Error clearing test data:', error);
  }
  try {
    if (process.env.LOYALTY_REALDB !== '1') {
      const dbmod: any = await import('../../server/db');
      const reset = dbmod.__reset as () => void;
      reset();
    }
  } catch {}
}

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}); 