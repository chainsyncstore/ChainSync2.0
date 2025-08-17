import { beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';
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
let webProcess: any;
let serverUrl: string;

// Global E2E test setup
beforeAll(async () => {
  console.log('Setting up E2E test environment...');

  // API server target
  serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:5000';

  if (process.env.START_SERVER !== 'false') {
    try {
      // Start lightweight test API server on port 5000
      const serverEntry = path.resolve(process.cwd(), 'server', 'test-server.ts');
      serverProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', serverEntry], {
        stdio: 'inherit',
        env: { ...process.env, PORT: '5000', NODE_ENV: 'test' }
      });

      // Start static web server for built client on port 3000, if dist exists
      const staticDir = path.resolve(process.cwd(), 'dist', 'public');
      webProcess = spawn(process.execPath, ['-e', `
        import('node:http').then(http=>{
          const fs=require('fs');
          const path=require('path');
          const mime=(p)=>{
            if(p.endsWith('.js')) return 'application/javascript';
            if(p.endsWith('.css')) return 'text/css';
            if(p.endsWith('.html')) return 'text/html';
            if(p.endsWith('.json')) return 'application/json';
            if(p.endsWith('.svg')) return 'image/svg+xml';
            if(p.match(/\.(png|jpg|jpeg|gif|ico)$/)) return 'image/*';
            return 'text/plain';
          };
          const root='${staticDir.replace(/\\/g,'\\\\')}';
          const server=http.createServer((req,res)=>{
            let reqPath=(req.url||'/').split('?')[0];
            if(reqPath==='/'||reqPath==='') reqPath='/index.html';
            let filePath=path.join(root, reqPath);
            fs.readFile(filePath,(err,data)=>{
              if(err){
                // SPA fallback
                const indexPath=path.join(root,'index.html');
                fs.readFile(indexPath,(err2,data2)=>{
                  if(err2){ res.statusCode=404; return res.end('not found'); }
                  res.setHeader('Content-Type','text/html');
                  res.statusCode=200; return res.end(data2);
                });
              } else {
                res.setHeader('Content-Type', mime(filePath));
                res.statusCode=200; res.end(data);
              }
            });
          });
          server.listen(3000,()=>console.log('Static web server on http://localhost:3000'));
        });
      `], { stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to start servers for E2E tests:', error);
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
  if (webProcess) {
    try {
      webProcess.kill('SIGTERM');
    } catch {}
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