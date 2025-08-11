// Test Environment Configuration
export const TEST_CONFIG = {
  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/chainsync_test',
    timeout: 10000,
    retries: 3
  },
  
  // Server
  server: {
    port: process.env.PORT || 5001,
    url: process.env.TEST_SERVER_URL || 'http://localhost:5001',
    startServer: process.env.START_SERVER !== 'false',
    startupTimeout: 30000
  },
  
  // Test Timeouts
  timeouts: {
    unit: 10000,
    integration: 30000,
    e2e: 60000,
    hook: 10000,
    teardown: 10000
  },
  
  // Coverage
  coverage: {
    enabled: true,
    threshold: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    }
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'error',
    enableConsole: false,
    enableFile: false
  },
  
  // Mocking
  mocking: {
    enableConsole: true,
    enableFetch: true,
    enableStorage: true,
    enableTimers: false
  }
};

// Environment validation
export const validateTestEnvironment = () => {
  const required = ['NODE_ENV'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (process.env.NODE_ENV !== 'test') {
    console.warn('Warning: NODE_ENV is not set to "test"');
  }
  
  return true;
};

// Test utilities
export const createTestConfig = (overrides = {}) => ({
  ...TEST_CONFIG,
  ...overrides
});
