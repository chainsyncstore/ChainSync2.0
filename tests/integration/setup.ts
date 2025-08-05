import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import dotenv from 'dotenv';
import { db } from '@server/db';
import { storage } from '@server/storage';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

let testDb: any;

// Global integration test setup
beforeAll(async () => {
  console.log('Setting up integration test environment...');
  
  // Ensure we're using test database
  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error('Integration tests must use a test database');
  }
  
  // Initialize test database connection
  testDb = db;
});

// Global integration test cleanup
afterAll(async () => {
  console.log('Cleaning up integration test environment...');
  
  // Close database connection
  if (testDb) {
    await testDb.end();
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
      // Table might not exist, ignore
    }
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