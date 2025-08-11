import { beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import '@testing-library/jest-dom';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock the database module
vi.mock('./server/db', () => ({
  db: {
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
  }
}));

// Import and use comprehensive crypto mock
import { cryptoModuleMock } from './utils/crypto-mocks';

// Mock crypto module with comprehensive mock
vi.mock('crypto', () => cryptoModuleMock);

// Mock bcrypt module
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn((password, rounds) => Promise.resolve('mocked-hash-' + password)),
    compare: vi.fn((password, hash) => Promise.resolve(password === 'correct-password'))
  },
  hash: vi.fn((password, rounds) => Promise.resolve('mocked-hash-' + password)),
  compare: vi.fn((password, hash) => Promise.resolve(password === 'correct-password'))
}));

// Mock jsonwebtoken module
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn((payload, secret, options) => 'mocked-jwt-token'),
    verify: vi.fn((token, secret) => ({ userId: 'mocked-user-id', iat: Date.now() })),
    decode: vi.fn((token) => ({ userId: 'mocked-user-id', iat: Date.now() }))
  },
  sign: vi.fn((payload, secret, options) => 'mocked-jwt-token'),
  verify: vi.fn((token, secret) => ({ userId: 'mocked-user-id', iat: Date.now() })),
  decode: vi.fn((token) => ({ userId: 'mocked-user-id', iat: Date.now() }))
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ column, value, operator: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, operator: 'and' })),
  or: vi.fn((...conditions) => ({ conditions, operator: 'or' })),
  lt: vi.fn((column, value) => ({ column, value, operator: 'lt' })),
  gte: vi.fn((column, value) => ({ column, value, operator: 'gte' })),
  desc: vi.fn((column) => ({ column, direction: 'desc' })),
  asc: vi.fn((column) => ({ column, direction: 'asc' })),
  sql: vi.fn((strings, ...values) => ({ strings, values, type: 'sql' })),
  defaultNow: vi.fn(() => ({ type: 'defaultNow' })),
  relations: vi.fn((table, config) => ({ table, config, type: 'relations' }))
}));

// Mock zxcvbn library
vi.mock('zxcvbn', () => ({
  zxcvbn: vi.fn((password: string) => {
    // Mock password strength results
    if (password.length < 4) {
      return {
        score: 0,
        feedback: {
          warning: 'Password is too short',
          suggestions: ['Make it longer', 'Add numbers']
        }
      };
    } else if (password === 'password') {
      return {
        score: 2,
        feedback: {
          warning: 'Common password',
          suggestions: ['Use a unique password', 'Add special characters']
        }
      };
    } else if (password === 'Password123') {
      return {
        score: 3,
        feedback: {
          warning: 'Could be stronger',
          suggestions: ['Add special characters', 'Make it longer']
        }
      };
    } else if (password === 'SecurePass123!@#') {
      return {
        score: 4,
        feedback: {
          warning: '',
          suggestions: []
        }
      };
    } else {
      return {
        score: 2,
        feedback: {
          warning: '',
          suggestions: ['Add numbers', 'Add special characters']
        }
      };
    }
  })
}));

// Mock the shared schema module
vi.mock('@shared/schema', () => ({
  users: { name: 'users', type: 'table' },
  stores: { name: 'stores', type: 'table' },
  products: { name: 'products', type: 'table' },
  inventory: { name: 'inventory', type: 'table' },
  transactions: { name: 'transactions', type: 'table' },
  transactionItems: { name: 'transactionItems', type: 'table' },
  lowStockAlerts: { name: 'lowStockAlerts', type: 'table' },
  userStorePermissions: { name: 'userStorePermissions', type: 'table' },
  loyaltyTiers: { name: 'loyaltyTiers', type: 'table' },
  customers: { name: 'customers', type: 'table' },
  loyaltyTransactions: { name: 'loyaltyTransactions', type: 'table' },
  ipWhitelists: { name: 'ipWhitelists', type: 'table' },
  ipWhitelistLogs: { name: 'ipWhitelistLogs', type: 'table' },
  passwordResetTokens: { name: 'passwordResetTokens', type: 'table' },
  emailVerificationTokens: { name: 'emailVerificationTokens', type: 'table' },
  phoneVerificationOTP: { name: 'phoneVerificationOTP', type: 'table' },
  userSessions: { name: 'userSessions', type: 'table' },
  accountLockoutLogs: { name: 'accountLockoutLogs', type: 'table' },
  insertUserSchema: { type: 'schema' },
  insertStoreSchema: { type: 'schema' },
  insertProductSchema: { type: 'schema' },
  insertInventorySchema: { type: 'schema' },
  insertTransactionSchema: { type: 'schema' },
  insertTransactionItemSchema: { type: 'schema' },
  insertLowStockAlertSchema: { type: 'schema' },
  insertLoyaltyTierSchema: { type: 'schema' },
  insertCustomerSchema: { type: 'schema' },
  insertLoyaltyTransactionSchema: { type: 'schema' },
  insertIpWhitelistSchema: { type: 'schema' },
  insertIpWhitelistLogSchema: { type: 'schema' },
  insertPasswordResetTokenSchema: { type: 'schema' },
  insertEmailVerificationTokenSchema: { type: 'schema' },
  insertPhoneVerificationOTPSchema: { type: 'schema' },
  insertUserSessionSchema: { type: 'schema' },
  insertAccountLockoutLogSchema: { type: 'schema' }
}));

// Mock drizzle-orm/pg-core with proper method chaining
vi.mock('drizzle-orm/pg-core', () => {
  const createMockColumn = (name: string, type: string) => {
    const mockColumn = {
      name,
      type,
      primaryKey: () => ({ ...mockColumn, isPrimaryKey: true }),
      default: (value: any) => ({ ...mockColumn, defaultValue: value }),
      notNull: () => ({ ...mockColumn, isNotNull: true }),
      unique: () => ({ ...mockColumn, isUnique: true }),
      length: (len: number) => ({ ...mockColumn, length: len }),
      precision: (prec: number) => ({ ...mockColumn, precision: prec }),
      scale: (scale: number) => ({ ...mockColumn, scale: scale }),
      on: (table: any) => ({ ...mockColumn, onTable: table })
    };
    return mockColumn;
  };

  const createMockEnum = (name: string, values: string[]) => {
    const mockEnum = vi.fn((columnName: string) => ({
      ...createMockColumn(columnName, `enum_${name}`),
      notNull: () => ({ ...createMockColumn(columnName, `enum_${name}`), isNotNull: true }),
      default: (value: any) => ({ ...createMockColumn(columnName, `enum_${name}`), defaultValue: value })
    }));
    return mockEnum;
  };

  return {
    pgTable: vi.fn((name, columns) => ({ name, columns, type: 'pgTable' })),
    text: vi.fn((name) => createMockColumn(name, 'text')),
    varchar: vi.fn((name, options) => createMockColumn(name, 'varchar')),
    decimal: vi.fn((name, options) => createMockColumn(name, 'decimal')),
    integer: vi.fn((name) => createMockColumn(name, 'integer')),
    timestamp: vi.fn((name) => ({
      ...createMockColumn(name, 'timestamp'),
      defaultNow: () => ({ ...createMockColumn(name, 'timestamp'), hasDefaultNow: true })
    })),
    boolean: vi.fn((name) => createMockColumn(name, 'boolean')),
    uuid: vi.fn((name) => createMockColumn(name, 'uuid')),
    pgEnum: createMockEnum,
    index: vi.fn((name, options) => ({ name, options, type: 'index' })),
    sql: vi.fn((strings, ...values) => ({ strings, values, type: 'sql' }))
  };
});

// Global test setup
beforeAll(async () => {
  // Any global setup needed for unit tests
  console.log('Setting up unit test environment...');
  
  // Ensure test environment is properly configured
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must run in test environment');
  }
});

// Global test cleanup
afterAll(async () => {
  // Any global cleanup needed
  console.log('Cleaning up unit test environment...');
});

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

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock crypto for tests
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
  } as any;
} 