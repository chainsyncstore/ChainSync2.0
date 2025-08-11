import { beforeAll, afterAll, vi } from 'vitest';
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

// Mock crypto module for E2E tests
vi.mock('crypto', () => cryptoModuleMock);

let serverProcess: any;
let serverUrl: string;

// Global E2E test setup
beforeAll(async () => {
  console.log('Setting up E2E test environment...');
  
  // Start the server for E2E tests
  serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:5001';
  
  if (process.env.START_SERVER !== 'false') {
    try {
      // For now, we'll skip starting the actual server in tests
      // This can be enabled when needed for real E2E testing
      console.log('Server startup skipped for test environment');
    } catch (error) {
      console.error('Failed to start server for E2E tests:', error);
      throw error;
    }
  }
  
  console.log(`E2E tests will run against: ${serverUrl}`);
});

// Global E2E test cleanup
afterAll(async () => {
  console.log('Cleaning up E2E test environment...');
  
  // Stop the server
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        serverProcess.on('close', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
      console.log('Server stopped successfully');
    } catch (error) {
      console.warn('Error stopping server:', error);
      // Force kill if graceful shutdown fails
      try {
        serverProcess.kill('SIGKILL');
      } catch (killError) {
        console.warn('Failed to force kill server:', killError);
      }
    }
  }
});

// Export server URL for tests
export { serverUrl };

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