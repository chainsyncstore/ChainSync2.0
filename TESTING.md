# ChainSync Testing Documentation

## Overview

ChainSync includes a comprehensive testing suite designed to catch issues before users do. The testing infrastructure includes:

- **Unit Tests**: Test individual functions and components in isolation
- **Integration Tests**: Test API endpoints and database interactions
- **End-to-End Tests**: Test the complete application stack
- **Monitoring & Logging**: Comprehensive logging and metrics collection

## Test Structure

```
tests/
├── setup.ts                    # Main test setup
├── unit/                       # Unit tests
│   ├── auth.test.ts           # Authentication tests
│   ├── monitoring.test.ts     # Monitoring service tests
│   └── logger.test.ts         # Logger tests
├── integration/               # Integration tests
│   ├── setup.ts              # Integration test setup
│   ├── auth.test.ts          # Authentication integration tests
│   ├── pos.test.ts           # POS transaction tests
│   ├── inventory.test.ts     # Inventory management tests
│   └── payment.test.ts       # Payment processing tests
└── e2e/                      # End-to-end tests
    └── setup.ts              # E2E test setup
```

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. Test Database Setup

Create a test database separate from your development/production database:

```sql
CREATE DATABASE chainsync_test;
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE chainsync_test TO test_user;
```

### 3. Environment Configuration

Create a `.env.test` file with test-specific configuration:

```env
# Test Environment Configuration
NODE_ENV=test
LOG_LEVEL=error

# Test Database
DATABASE_URL=postgresql://test_user:test_password@localhost:5432/chainsync_test

# Test Session Secret
SESSION_SECRET=test-session-secret-key-for-testing-only

# Test Payment Configuration
PAYSTACK_SECRET_KEY=sk_test_test_key
PAYSTACK_PUBLIC_KEY=pk_test_test_key
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST_test_key
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST_test_key

# Test Email Configuration
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=test_user
SMTP_PASS=test_password
FROM_EMAIL=test@chainsync.com

# Test Storage Configuration
GOOGLE_CLOUD_PROJECT=test-project
GOOGLE_CLOUD_BUCKET=test-bucket

# Test OpenAI Configuration
OPENAI_API_KEY=sk-test-key

# Test Base URL
BASE_URL=http://localhost:5001

# Test Server Configuration
PORT=5001
```

## Running Tests

### 1. Unit Tests

Run all unit tests:

```bash
npm run test
```

Run unit tests with coverage:

```bash
npm run test:coverage
```

Run unit tests with UI:

```bash
npm run test:ui
```

### 2. Integration Tests

Run integration tests:

```bash
npm run test:integration
```

### 3. End-to-End Tests

Run E2E tests:

```bash
npm run test:e2e
```

### 4. All Tests

Run all tests:

```bash
npm run test:run
```

## Test Categories

### Authentication Tests

**Unit Tests** (`tests/unit/auth.test.ts`):
- Password validation
- User sanitization
- Reset token generation
- Error handling

**Integration Tests** (`tests/integration/auth.test.ts`):
- User registration
- Login/logout flow
- Password reset
- Session management

### POS Transaction Tests

**Integration Tests** (`tests/integration/pos.test.ts`):
- Transaction creation
- Item addition
- Transaction completion
- Transaction voiding
- Inventory updates
- Receipt generation

### Inventory Management Tests

**Integration Tests** (`tests/integration/inventory.test.ts`):
- Stock adjustments
- Low stock alerts
- Bulk updates
- Stock movements
- Stock counts

### Payment Processing Tests

**Integration Tests** (`tests/integration/payment.test.ts`):
- Payment initialization
- Payment verification
- Webhook handling
- Error scenarios
- Security validation

### Monitoring & Logging Tests

**Unit Tests** (`tests/unit/monitoring.test.ts`):
- Metrics recording
- Performance calculations
- Business metrics
- Data aggregation

**Unit Tests** (`tests/unit/logger.test.ts`):
- Log level filtering
- Context inclusion
- Error logging
- Production vs development output

## Monitoring & Logging

### Logging System

The application includes a comprehensive logging system with:

- **Structured Logging**: JSON format in production, readable format in development
- **Log Levels**: ERROR, WARN, INFO, DEBUG, TRACE
- **Context Inclusion**: User ID, store ID, IP address, etc.
- **Specialized Methods**: Auth events, transactions, inventory, payments, security

### Monitoring System

The monitoring system tracks:

- **Performance Metrics**: Response times, error rates, request counts
- **Business Metrics**: Logins, transactions, revenue, inventory updates
- **Security Events**: Failed logins, IP blocks, unauthorized access

### Monitoring Endpoints

Admin-only endpoints for monitoring data:

- `GET /api/monitoring/performance` - Performance metrics
- `GET /api/monitoring/business` - Business metrics
- `GET /api/monitoring/all` - All metrics
- `DELETE /api/monitoring/clear` - Clear all metrics

## Test Data Management

### Database Cleanup

Integration tests automatically:
- Clear all data before each test
- Clear all data after each test
- Use isolated test data

### Test Users

Tests create temporary users with:
- Valid credentials
- Appropriate roles
- Associated stores
- Test products and inventory

## Writing New Tests

### Unit Test Guidelines

1. **Test Structure**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

2. **Mocking**:
```typescript
import { vi } from 'vitest';

// Mock external dependencies
vi.mock('@server/payment/service', () => ({
  PaymentService: vi.fn().mockImplementation(() => ({
    // Mock methods
  }))
}));
```

### Integration Test Guidelines

1. **Test Setup**:
```typescript
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '@server/routes';

describe('API Endpoint', () => {
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);
  });

  it('should handle request', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .send(data)
      .expect(200);

    expect(response.body).toHaveProperty('expected');
  });
});
```

2. **Authentication**:
```typescript
// Create test user and login
const loginResponse = await request(app)
  .post('/api/auth/login')
  .send(credentials);

const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';

// Use session cookie in subsequent requests
await request(app)
  .get('/api/protected')
  .set('Cookie', sessionCookie)
  .expect(200);
```

## Continuous Integration

### GitHub Actions

The project includes GitHub Actions workflows for:

- Running tests on pull requests
- Code coverage reporting
- Security scanning
- Performance testing

### Pre-commit Hooks

Install pre-commit hooks:

```bash
npm install -g husky
npx husky install
npx husky add .husky/pre-commit "npm run test:run"
```

## Performance Testing

### Load Testing

Use tools like Artillery or k6 for load testing:

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery run load-test.yml
```

### Benchmark Testing

Monitor key metrics:
- Response times (p50, p95, p99)
- Throughput (requests per second)
- Error rates
- Memory usage
- CPU usage

## Security Testing

### Authentication Testing

- Test password strength validation
- Test session management
- Test role-based access control
- Test brute force protection

### Input Validation Testing

- Test SQL injection prevention
- Test XSS prevention
- Test CSRF protection
- Test input sanitization

## Maintenance

### Regular Tasks

1. **Update Test Dependencies**:
```bash
npm update
npm audit fix
```

2. **Review Test Coverage**:
```bash
npm run test:coverage
```

3. **Update Test Data**:
- Review and update test fixtures
- Ensure test data is realistic
- Remove obsolete test cases

4. **Performance Monitoring**:
- Review monitoring metrics
- Update alert thresholds
- Optimize slow queries

### Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Verify test database exists
   - Check connection string
   - Ensure user permissions

2. **Test Timeouts**:
   - Increase timeout values in test config
   - Check for hanging database connections
   - Review async test patterns

3. **Mock Issues**:
   - Verify mock implementations
   - Check import paths
   - Ensure mocks are reset between tests

### Debug Mode

Run tests in debug mode:

```bash
# Enable debug logging
LOG_LEVEL=debug npm run test

# Run specific test file
npm run test tests/unit/auth.test.ts

# Run with verbose output
npm run test -- --reporter=verbose
```

## Best Practices

### Test Organization

1. **Group Related Tests**: Use describe blocks to organize tests
2. **Clear Test Names**: Use descriptive test names
3. **Single Responsibility**: Each test should test one thing
4. **Independent Tests**: Tests should not depend on each other

### Data Management

1. **Use Test Data**: Create realistic test data
2. **Clean Up**: Always clean up after tests
3. **Isolation**: Tests should not affect each other
4. **Fixtures**: Use fixtures for common test data

### Performance

1. **Fast Tests**: Keep tests fast and efficient
2. **Parallel Execution**: Use parallel test execution
3. **Mock External Services**: Mock slow external dependencies
4. **Database Optimization**: Use efficient database queries

### Security

1. **Test Security Features**: Always test security functionality
2. **Input Validation**: Test all input validation
3. **Authentication**: Test authentication flows
4. **Authorization**: Test role-based access control

## Contributing

When adding new features:

1. **Write Tests First**: Follow TDD principles
2. **Update Documentation**: Update this documentation
3. **Add Monitoring**: Add appropriate logging and metrics
4. **Review Coverage**: Ensure adequate test coverage

## Support

For testing issues:

1. Check the troubleshooting section
2. Review test logs and error messages
3. Consult the Vitest documentation
4. Create an issue with detailed information

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Node.js Testing Guide](https://nodejs.org/en/docs/guides/testing-and-debugging/) 