import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/unit/**', 'tests/e2e/**', 'node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Ensure proper Node.js environment for crypto module
    environmentOptions: {
      node: {
        globals: true
      }
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, './shared'),
      '@server': resolve(__dirname, './server'),
      '@client': resolve(__dirname, './client/src'),
      // Ensure crypto module is properly resolved for Node.js tests
      crypto: 'crypto-browserify'
    }
  }
}); 