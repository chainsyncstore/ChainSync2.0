import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import dotenv from 'dotenv';
import { cryptoModuleMock } from '../utils/crypto-mocks';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock the database module
vi.mock('../../server/db', () => ({
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

// Mock the storage module
vi.mock('../../server/storage', () => ({
  storage: {
    upload: vi.fn().mockResolvedValue({ url: 'mocked-url' }),
    delete: vi.fn().mockResolvedValue(true),
    getSignedUrl: vi.fn().mockResolvedValue('mocked-signed-url')
  }
}));

// Mock crypto module for integration tests
vi.mock('crypto', () => cryptoModuleMock);

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