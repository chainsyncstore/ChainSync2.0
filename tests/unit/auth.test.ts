import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cryptoModuleMock } from '../utils/crypto-mocks';

// Import AuthService after mocking
import { AuthService } from '../../server/auth';

// Mock the database module
vi.mock('../../server/db', () => {
  let callCount = 0;
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockImplementation(() => {
        callCount++;
        return [{
          id: `mock-token-id-${callCount}`,
          userId: 'test-user-id',
          token: `mock-generated-token-${callCount}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isUsed: false,
          createdAt: new Date(),
          usedAt: null
        }];
      })
    }
  };
});

// Mock the schema tables
vi.mock('@shared/schema', () => ({
  emailVerificationTokens: 'emailVerificationTokens',
  users: 'users'
}));

// Mock bcrypt
vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn()
}));

// Mock crypto module with shared instance
vi.mock('crypto', () => ({
  default: cryptoModuleMock,
  ...cryptoModuleMock
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
  verify: vi.fn(),
  decode: vi.fn()
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ column, value, operator: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, operator: 'and' })),
  or: vi.fn((...conditions) => ({ conditions, operator: 'or' })),
  lt: vi.fn((column, value) => ({ column, value, operator: 'lt' })),
  gte: vi.fn((column, value) => ({ column, value, operator: 'gte' })),
  sql: vi.fn((strings, ...values) => ({ strings, values, type: 'sql' })),
  relations: vi.fn((table, config) => ({ table, config, type: 'relations' }))
}));

describe('AuthService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset crypto mock history
    cryptoModuleMock.__reset();
  });

  describe('createEmailVerificationToken', () => {
    it('should create an email verification token', async () => {
      const token = await AuthService.createEmailVerificationToken('test-user-id');

      expect(token).toBeDefined();
      expect(token.token).toBeDefined();
      expect(typeof token.token).toBe('string');
      expect(token.token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', async () => {
      const token1 = await AuthService.createEmailVerificationToken('test-user-id-1');
      const token2 = await AuthService.createEmailVerificationToken('test-user-id-2');

      expect(token1.token).not.toBe(token2.token);
    });

    it('should track crypto calls in history', async () => {
      // Clear any existing history
      cryptoModuleMock.__reset();
      
      await AuthService.createEmailVerificationToken('test-user-id');
      
      // Verify that crypto functions were called and tracked
      expect(cryptoModuleMock.__callHistory.randomBytes.length).toBeGreaterThan(0);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const strongPassword = 'SecurePass123!@#';
      const result = AuthService.validatePassword(strongPassword);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short',
        'nouppercase123!',
        'NOLOWERCASE123!',
        'NoNumbers!',
        'NoSpecialChars123'
      ];

      weakPasswords.forEach(password => {
        const result = AuthService.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });
}); 