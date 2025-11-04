import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx'
    ],
    exclude: [
      'tests/integration/**',
      'tests/e2e/**',
      'tests/playwright/**',
      'node_modules/**',
      'dist/**',
      'build/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        'build/**',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/*.config.js',
        'server/vite.ts',
        'scripts/**',
        'migrations/**'
      ],
      include: [
        'client/src/**/*',
        'server/**/*',
        'shared/**/*'
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
      '@client': path.resolve(__dirname, './client/src'),
      '@': path.resolve(__dirname, './client/src'),
      // Ensure crypto module is properly resolved for tests
      crypto: 'crypto-browserify'
    }
  },
  define: {
    global: 'globalThis'
  }
}); 