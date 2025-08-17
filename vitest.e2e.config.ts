import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/e2e/setup.ts'],
    include: ['tests/e2e/**/*.test.ts', 'tests/e2e/**/*.test.tsx'],
    exclude: ['tests/unit/**', 'tests/integration/**', 'node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Disable browser runner to avoid requiring @vitest/browser for these server-driven E2E tests
    browser: {
      enabled: false,
      name: 'chromium',
      headless: true,
      provider: 'playwright'
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, './shared'),
      '@server': resolve(__dirname, './server'),
      '@client': resolve(__dirname, './client/src'),
      '@': resolve(__dirname, './client/src'),
      // Ensure crypto module is properly resolved for E2E tests
      crypto: 'crypto-browserify'
    }
  }
}); 