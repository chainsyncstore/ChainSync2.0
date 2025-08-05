import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

let serverProcess: any;
let serverUrl: string;

// Global E2E test setup
beforeAll(async () => {
  console.log('Setting up E2E test environment...');
  
  // Start the server for E2E tests
  serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:5001';
  
  if (process.env.START_SERVER !== 'false') {
    serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: '5001',
        NODE_ENV: 'test'
      }
    });
    
    // Wait for server to start
    await new Promise((resolve) => {
      serverProcess.stdout?.on('data', (data: Buffer) => {
        if (data.toString().includes('serving on port 5001')) {
          resolve(true);
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(resolve, 30000);
    });
  }
  
  console.log(`E2E tests will run against: ${serverUrl}`);
});

// Global E2E test cleanup
afterAll(async () => {
  console.log('Cleaning up E2E test environment...');
  
  // Stop the server
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise((resolve) => {
      serverProcess.on('close', resolve);
    });
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