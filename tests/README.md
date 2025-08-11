# Testing Configuration Guide

This document outlines the testing environment setup for ChainSync-2.

## Test Environment Structure

```
tests/
├── config/           # Test configuration files
├── e2e/             # End-to-end tests
├── integration/      # Integration tests
├── unit/            # Unit tests
├── utils/           # Test utilities and helpers
├── setup.ts         # Main test setup
└── README.md        # This file
```

## Test Types

### 1. Unit Tests (`vitest.config.ts`)
- **Purpose**: Test individual components and functions in isolation
- **Environment**: jsdom (simulates browser environment)
- **Coverage**: Includes client, server, and shared code
- **Command**: `npm run test:unit`

### 2. Integration Tests (`vitest.integration.config.ts`)
- **Purpose**: Test component interactions and database operations
- **Environment**: Node.js
- **Database**: Uses test database with automatic cleanup
- **Command**: `npm run test:integration`

### 3. End-to-End Tests (`vitest.e2e.config.ts`)
- **Purpose**: Test complete user workflows
- **Environment**: jsdom + Playwright browser
- **Server**: Automatically starts test server
- **Command**: `npm run test:e2e`

## Environment Configuration

### Required Environment Variables
Create a `.env.test` file with:

```bash
NODE_ENV=test
LOG_LEVEL=error
DATABASE_URL=postgresql://test:test@localhost:5432/chainsync_test
PORT=5001
TEST_SERVER_URL=http://localhost:5001
START_SERVER=true
```

### Database Setup
For integration tests, ensure you have:
- A test database (separate from development/production)
- Proper database permissions
- Database migrations applied

## Running Tests

### All Tests
```bash
npm run test:all
```

### Individual Test Types
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

### Development Mode
```bash
# Watch mode for development
npm run test:watch

# Debug mode
npm run test:debug

# UI mode
npm run test:ui
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Utilities

### Common Helpers (`tests/utils/test-helpers.ts`)
- `createMockUser()` - Create mock user data
- `createMockStore()` - Create mock store data
- `createMockProduct()` - Create mock product data
- `mockConsole()` - Mock console methods
- `mockFetch()` - Mock fetch API
- `mockLocalStorage()` - Mock localStorage
- `mockSessionStorage()` - Mock sessionStorage
- `waitFor()` - Wait for async conditions
- `cleanup()` - Clean up test state

### Database Helpers (`tests/config/database.ts`)
- `createTestDatabase()` - Create test database connection
- `clearTestTables()` - Clear all test data
- `seedTestData()` - Seed test data
- `testDatabaseConnection()` - Test database connectivity

## Writing Tests

### Unit Test Example
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductList } from '@client/components/inventory/product-list';

describe('ProductList', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should render product list', () => {
    render(<ProductList products={[]} />);
    expect(screen.getByText('Products')).toBeInTheDocument();
  });
});
```

### Integration Test Example
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@server/db';
import { createTestDatabase, clearTestTables } from '../config/database';

describe('Product API', () => {
  let testDb: any;

  beforeEach(async () => {
    testDb = createTestDatabase();
    await clearTestTables(testDb);
  });

  it('should create a product', async () => {
    // Test implementation
  });
});
```

### E2E Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { serverUrl } from './setup';

describe('User Authentication Flow', () => {
  it('should complete login process', async () => {
    // Navigate to login page
    // Fill in credentials
    // Submit form
    // Verify redirect
  });
});
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` and `afterEach` for setup/cleanup
- Avoid shared state between tests

### 2. Mocking
- Mock external dependencies (APIs, databases)
- Use realistic test data
- Avoid over-mocking

### 3. Assertions
- Test behavior, not implementation
- Use descriptive test names
- One assertion per test when possible

### 4. Performance
- Keep tests fast
- Use appropriate timeouts
- Clean up resources properly

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify `.env.test` has correct `DATABASE_URL`
   - Ensure test database exists and is accessible
   - Check database permissions

2. **Test Timeouts**
   - Increase timeout values in config files
   - Check for hanging async operations
   - Verify proper cleanup in `afterEach`/`afterAll`

3. **Environment Variable Issues**
   - Ensure `.env.test` file exists
   - Check variable names match expected values
   - Verify `NODE_ENV=test` is set

4. **Coverage Issues**
   - Check exclude patterns in config
   - Verify source files are included
   - Ensure tests are running against correct files

### Debug Mode
Use `npm run test:debug` to run tests with Node.js inspector enabled.

### Verbose Logging
Set `LOG_LEVEL=debug` in `.env.test` for more detailed output.

## Continuous Integration

The testing configuration is designed to work with CI/CD pipelines:

- Unit tests run quickly for immediate feedback
- Integration tests verify database operations
- E2E tests ensure complete functionality
- Coverage reports help maintain code quality

## Maintenance

### Regular Tasks
- Update test dependencies
- Review and update mocks
- Maintain test data factories
- Update test configurations as needed

### Monitoring
- Track test execution times
- Monitor coverage trends
- Review test failures
- Update test utilities
