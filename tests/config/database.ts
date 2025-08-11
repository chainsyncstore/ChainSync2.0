import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { vi } from 'vitest';

// Mock database for tests
export const createMockDatabase = () => {
  const mockDb = {
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

  return mockDb;
};

// Test database configuration (only used if real database is needed)
export const createTestDatabase = () => {
  if (process.env.NODE_ENV === 'test' && process.env.USE_REAL_DB !== 'true') {
    return createMockDatabase();
  }

  const sql = neon(process.env.DATABASE_URL || '');
  return drizzle(sql);
};

// Test database cleanup utilities
export const clearTestTables = async (db: any) => {
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
      await db.execute(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (error) {
      // Table might not exist, ignore
    }
  }
};

// Test data seeding utilities
export const seedTestData = async (db: any) => {
  // Add minimal test data if needed
  // This can be expanded based on test requirements
};

// Database connection test
export const testDatabaseConnection = async (db: any) => {
  try {
    await db.execute('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
};

// Export mock database for tests
export const mockDb = createMockDatabase();
