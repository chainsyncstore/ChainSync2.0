# Test Utilities

This directory contains utility functions and mocks for testing the ChainSync application.

## Crypto Mocks

The `crypto-mocks.ts` file provides comprehensive mocking for Node.js crypto module functions used in the application.

### Features

- **Deterministic Random Generation**: All random functions generate predictable values for consistent test results
- **Call History Tracking**: Track all calls to crypto functions for assertion testing
- **Full API Coverage**: Mock all crypto functions used in the application
- **TypeScript Support**: Full type definitions for the mock objects
- **Reset Functionality**: Clear call history and reset counters between tests

### Usage

#### Basic Import

```typescript
import { createCryptoMock, cryptoModuleMock, globalCryptoMock } from '../utils/crypto-mocks';
```

#### Mock the Entire Crypto Module

```typescript
import { vi } from 'vitest';
import { cryptoModuleMock } from '../utils/crypto-mocks';

// Mock the crypto module for all tests
vi.mock('crypto', () => cryptoModuleMock);
```

#### Create Individual Mock Instances

```typescript
import { createCryptoMock } from '../utils/crypto-mocks';

describe('My Test', () => {
  let mockCrypto: any;

  beforeEach(() => {
    mockCrypto = createCryptoMock();
    vi.clearAllMocks();
  });

  it('should use crypto functions', () => {
    const token = mockCrypto.randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
  });
});
```

#### Mock Global Crypto (Web Crypto API)

```typescript
import { globalCryptoMock } from '../utils/crypto-mocks';

// For browser environment tests
global.crypto = globalCryptoMock;
```

### Available Mock Functions

#### Core Functions
- `randomBytes(size)` - Generate random bytes with toString() support
- `randomUUID()` - Generate unique UUIDs
- `createHash(algorithm)` - Create hash objects with update/digest
- `createHmac(algorithm, key)` - Create HMAC objects with update/digest
- `pbkdf2(password, salt, iterations, keylen, digest, callback)` - Password derivation
- `scrypt(password, salt, keylen, options, callback)` - Memory-hard password derivation

#### Additional Functions
- `randomFill(buffer, offset?, size?)` - Fill buffer with random values
- `randomInt(min?, max?)` - Generate random integers
- `getRandomValues(array)` - Web Crypto API compatibility
- `timingSafeEqual(a, b)` - Constant-time comparison
- `verify(algorithm, data, key, signature)` - Signature verification
- `sign(algorithm, data, key)` - Signature creation

#### Utility Functions
- `createCipher(algorithm)` - Encryption (legacy)
- `createDecipher(algorithm)` - Decryption (legacy)
- `generateKeyPair(type, options, callback)` - Key pair generation
- `createPublicKey(key)` - Public key creation
- `createPrivateKey(key)` - Private key creation
- `createSign(algorithm)` - Signing context
- `createVerify(algorithm)` - Verification context

### Call History

All mock functions track their call history for testing:

```typescript
// Check how many times randomBytes was called
expect(mockCrypto.__callHistory.randomBytes).toHaveLength(2);

// Check the parameters of the first call
expect(mockCrypto.__callHistory.randomBytes[0].size).toBe(32);

// Check the data used in hash creation
expect(mockCrypto.__callHistory.createHash[0].data).toBe('test-data');
```

### Reset Functionality

Clear call history and reset counters:

```typescript
beforeEach(() => {
  mockCrypto.__reset();
});
```

### Deterministic Behavior

The mocks generate deterministic values for consistent test results:

```typescript
// Same input always produces same output
const result1 = mockCrypto.randomBytes(16).toString();
const result2 = mockCrypto.randomBytes(16).toString();
expect(result1).toBe(result2);

// But different inputs produce different outputs
const result3 = mockCrypto.randomBytes(32).toString();
expect(result1).not.toBe(result3);
```

### Encoding Support

The mocks support multiple encodings:

```typescript
const bytes = mockCrypto.randomBytes(16);

// Hex encoding (default)
expect(bytes.toString()).toMatch(/^[0-9a-f]{32}$/);

// Base64 encoding
expect(bytes.toString('base64')).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

// Base64URL encoding
expect(bytes.toString('base64url')).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
```

### Testing Examples

#### Test Token Generation

```typescript
it('should generate secure tokens', () => {
  const token = mockCrypto.randomBytes(32).toString('hex');
  expect(token).toHaveLength(64);
  expect(token).toMatch(/^[0-9a-f]{64}$/);
});
```

#### Test Hash Creation

```typescript
it('should create proper hashes', () => {
  const hash = mockCrypto.createHash('sha256');
  const result = hash.update('password').digest('hex');
  expect(result).toMatch(/^mocked-sha256-hash-password$/);
});
```

#### Test Call Tracking

```typescript
it('should track crypto function calls', () => {
  mockCrypto.randomUUID();
  mockCrypto.randomBytes(16);
  
  expect(mockCrypto.__callHistory.randomUUID).toHaveLength(1);
  expect(mockCrypto.__callHistory.randomBytes).toHaveLength(1);
  expect(mockCrypto.__callHistory.randomBytes[0].size).toBe(16);
});
```

### Integration with Test Setup

The crypto mocks are automatically configured in the test setup files:

- `tests/setup.ts` - Unit tests
- `tests/integration/setup.ts` - Integration tests  
- `tests/e2e/setup.ts` - End-to-end tests

This ensures consistent crypto mocking across all test types without manual configuration.

### Troubleshooting

#### Mock Not Working

Ensure the mock is imported and applied before the module under test:

```typescript
// This must come BEFORE importing the module that uses crypto
vi.mock('crypto', () => cryptoModuleMock);

// Then import your module
import { AuthService } from '../../server/auth';
```

#### Type Errors

The mocks include full TypeScript definitions. If you encounter type errors, ensure you're importing the correct mock type:

```typescript
import { CryptoMock } from '../utils/crypto-mocks';

let mockCrypto: CryptoMock;
```

#### Inconsistent Results

If you need truly random results in tests, you can modify the mock to use actual random generation, but this may make tests flaky:

```typescript
const mockCrypto = createCryptoMock();
mockCrypto.randomBytes = vi.fn((size) => 
  crypto.randomBytes(size) // Use real crypto for this test
);
```
