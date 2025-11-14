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
  users as T_PRD_USERS,
  subscriptions as T_PRD_SUBSCRIPTIONS,
  subscriptionPayments as T_PRD_SUBSCRIPTION_PAYMENTS,
  organizations as T_PRD_ORGANIZATIONS,
} from '../../shared/prd-schema';
import {
  users as T_USERS,
  userRoles as T_USER_ROLES,
  subscriptions as T_SUBSCRIPTIONS,
  subscriptionPayments as T_SUBSCRIPTION_PAYMENTS,
  organizations as T_SHARED_ORGANIZATIONS,
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
      organizations: [],
    };

    function tableName(t: any): keyof typeof store {
      if (t === T_USERS) return 'users';
      if (t === T_PRD_USERS) return 'users';
      if (t === T_USER_ROLES) return 'user_roles';
      if (t === T_PRD_ORGANIZATIONS) return 'organizations';
      if (t === T_SHARED_ORGANIZATIONS) return 'organizations';
      if (t === T_STORES) return 'stores';
      if (t === T_PRODUCTS) return 'products';
      if (t === T_INVENTORY) return 'inventory';
      if (t === T_CUSTOMERS) return 'customers';
      if (t === T_LA) return 'loyalty_accounts';
      if (t === T_LT) return 'loyalty_transactions';
      if (t === T_SALES) return 'sales';
      if (t === T_SALE_ITEMS) return 'sale_items';
      if (t === T_AUDIT) return 'audit_logs';
      if (t === T_PRD_SUBSCRIPTIONS) return 'subscriptions';
      if (t === T_SUBSCRIPTIONS) return 'subscriptions';
      if (t === T_PRD_SUBSCRIPTION_PAYMENTS) return 'subscription_payments';
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
            if (expr) {
              const candidates = new Set<string>();
              const gather = (source: any) => {
                if (!source) return;
                if (typeof source === 'string') {
                  candidates.add(source);
                  const parts = source.split('.');
                  candidates.add(parts[parts.length - 1]);
                }
                if (source.name) gather(source.name);
                if (source.column) gather(source.column);
                if (source.key) gather(source.key);
                if (source.field) gather(source.field);
                if (source.columnName) gather(source.columnName);
              };
              gather(expr.left);
              gather(expr.column);
              gather(expr.field);

              const valueCandidate = expr.right?.value ?? expr.right ?? expr.value ?? null;
              const camelCandidates = Array.from(candidates)
                .filter(Boolean)
                .map((name) => toCamel(String(name)));

              const filtered = result.filter((row) => {
                if (!camelCandidates.length) {
                  return true;
                }
                return camelCandidates.some((col) => {
                  if (!(col in row)) return false;
                  const rowValue = row[col];
                  if (Array.isArray(rowValue)) {
                    return rowValue.includes(valueCandidate);
                  }
                  return rowValue === valueCandidate || rowValue === String(valueCandidate ?? '');
                });
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
      values: (obj: any) => {
        const key = tableName(tbl);

        const ensureId = () => (obj.id ? obj.id : genId(key));

        const insertRow = () => {
          const row = { id: ensureId(), ...obj } as Row;
          store[key].push(row);
          return row;
        };

        const upsert = (set?: Record<string, unknown>, targetColumn?: string) => {
          const column = targetColumn?.split('.').pop();
          const value = column ? (obj as Record<string, unknown>)[column] : undefined;
          if (column && value !== undefined) {
            const existing = store[key].find((r) => r[column] === value || r[column] === String(value));
            if (existing) {
              Object.assign(existing, set ?? {});
              return existing;
            }
          }
          return insertRow();
        };

        const inserted = insertRow();

        return {
          returning: async () => [inserted],
          onConflictDoNothing: () => Promise.resolve(),
          onConflictDoUpdate: (options: { target?: any[]; set?: Record<string, unknown> }) => {
            const targetCol = Array.isArray(options.target) && options.target.length > 0
              ? options.target[0]?.name || options.target[0]?.column || undefined
              : undefined;
            upsert(options.set, targetCol);
            return Promise.resolve();
          },
        };
      },
    }));

    const update = vi.fn((tbl?: any) => ({
      set: (partial: Record<string, unknown>) => ({
        where: (expr?: any) => {
          const key = tableName(tbl);
          const rows = store[key] || [];

          const gatherNames = (source: any, bucket: Set<string>) => {
            if (!source) return;
            const candidates: string[] = [];
            if (typeof source === 'string') candidates.push(source);
            if (source.name) candidates.push(source.name);
            if (source.column) candidates.push(source.column);
            if (source.key) candidates.push(source.key);
            if (source.columnName) candidates.push(source.columnName);
            if (source.table?.name) candidates.push(source.table.name);
            for (const name of candidates) {
              if (typeof name === 'string' && name.length > 0) {
                bucket.add(name);
              }
            }
          };

          const matches = (row: Row, condition: any): boolean => {
            if (!condition) return true;
            if (Array.isArray(condition.conditions)) {
              if (condition.operator === 'and') {
                return condition.conditions.every((c: any) => matches(row, c));
              }
              if (condition.operator === 'or') {
                return condition.conditions.some((c: any) => matches(row, c));
              }
            }

            const names = new Set<string>();
            gatherNames(condition.left, names);
            gatherNames(condition.column, names);
            gatherNames(condition.field, names);

            const valueCandidate = condition.right?.value ?? condition.right ?? condition.value ?? null;

            const camelNames = Array.from(names).flatMap((name) => {
              const parts = name.split('.');
              const base = parts[parts.length - 1];
              return [name, base]
                .filter(Boolean)
                .map((part) => toCamel(String(part)));
            });

            const idCandidate = valueCandidate ?? condition?.right?.value ?? condition?.value;
            if (idCandidate !== undefined) {
              const stringId = String(idCandidate);
              if (String((row as Row).id ?? '') === stringId) {
                return true;
              }
              if ('orgId' in row && String((row as Row).orgId ?? '') === stringId) {
                return true;
              }
            }

            if (!camelNames.length) {
              return true;
            }

            return camelNames.some((prop) => {
              if (!(prop in row)) return false;
              const rowValue = (row as Record<string, unknown>)[prop];
              if (Array.isArray(rowValue)) {
                return rowValue.includes(valueCandidate);
              }
              return rowValue === valueCandidate || rowValue === String(valueCandidate ?? '');
            });
          };

          const matched = expr ? rows.filter((row) => matches(row, expr)) : rows.slice();

          matched.forEach((row) => Object.assign(row, partial));

          return {
            returning: async () => matched,
          };
        },
      }),
    }));

    const extractQueryText = (query: unknown): string => {
      if (!query) {
        return '';
      }

      if (typeof query === 'string') {
        return query;
      }

      if (typeof query === 'object' && query !== null) {
        const obj = query as Record<string, unknown>;

        if (typeof obj.text === 'string') {
          return obj.text;
        }
        if (typeof obj.sql === 'string') {
          return obj.sql;
        }
        if (typeof obj.query === 'string') {
          return obj.query;
        }

        if (Array.isArray(obj.strings)) {
          return (obj.strings as unknown[])
            .map((part) => (typeof part === 'string' ? part : ''))
            .join(' ');
        }

        const chunks = obj.queryChunks;
        if (Array.isArray(chunks)) {
          return chunks
            .map((chunk: unknown) => {
              if (typeof chunk === 'string') {
                return chunk;
              }
              if (chunk && typeof chunk === 'object') {
                const chunkObj = chunk as Record<string, unknown>;
                if (typeof chunkObj.sql === 'string') {
                  return chunkObj.sql;
                }
                if (typeof chunkObj.text === 'string') {
                  return chunkObj.text;
                }
                const value = chunkObj.value;
                if (typeof value === 'string') {
                  return value;
                }
                if (Array.isArray(value)) {
                  return value
                    .map((part) => (typeof part === 'string' ? part : ''))
                    .join(' ');
                }
              }
              return '';
            })
            .join(' ');
        }

        if (typeof obj.toQuery === 'function') {
          try {
            const result = obj.toQuery();
            if (result && typeof result.text === 'string') {
              return result.text;
            }
          } catch {
            /* noop */
          }
        }

        if (typeof obj.toString === 'function') {
          try {
            return obj.toString();
          } catch {
            /* noop */
          }
        }
      }

      return '';
    };

    const _db: Record<string, any> = {
      select,
      insert,
      update,
      delete: vi.fn(),
      execute: vi.fn(async (query: unknown) => {
        const textRaw = extractQueryText(query);
        const text = textRaw.toLowerCase();

        if (text.includes('information_schema.columns') && text.includes('subscriptions')) {
          return [
            { column_name: 'id' },
            { column_name: 'org_id' },
            { column_name: 'user_id' },
            { column_name: 'tier' },
            { column_name: 'plan_code' },
            { column_name: 'provider' },
            { column_name: 'status' },
            { column_name: 'upfront_fee_paid' },
            { column_name: 'upfront_fee_currency' },
            { column_name: 'monthly_amount' },
            { column_name: 'monthly_currency' },
            { column_name: 'trial_start_date' },
            { column_name: 'trial_end_date' },
            { column_name: 'upfront_fee_credited' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' },
            { column_name: 'next_billing_date' },
            { column_name: 'autopay_enabled' },
            { column_name: 'autopay_provider' },
            { column_name: 'autopay_reference' },
            { column_name: 'autopay_configured_at' },
            { column_name: 'autopay_last_status' },
            { column_name: 'trial_reminder_7_sent_at' },
            { column_name: 'trial_reminder_3_sent_at' },
          ];
        }

        if (text.includes('pg_enum') && text.includes('subscription')) {
          return [
            { enumlabel: 'TRIAL' },
            { enumlabel: 'ACTIVE' },
            { enumlabel: 'PAST_DUE' },
            { enumlabel: 'CANCELLED' },
            { enumlabel: 'SUSPENDED' },
          ];
        }

        if (!text) {
          throw new Error('Mock DB execute encountered non-string query');
        }

        return [];
      }),
    };

    const pool = {
      connect: vi.fn(async () => ({ release: vi.fn() })),
      on: vi.fn(),
      end: vi.fn(async () => undefined),
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
      pool,
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
        organizations: [{ id: 'org-test', name: 'Test Org', currency: 'NGN', isActive: true }],
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