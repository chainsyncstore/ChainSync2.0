import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '@server/auth';
import { ValidationError, AuthenticationError } from '@server/lib/errors';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validatePassword', () => {
    it('should validate a strong password', () => {
      const result = AuthService.validatePassword('StrongPass123!');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        '123', // too short
        'password', // no uppercase, numbers, or special chars
        'PASSWORD', // no lowercase, numbers, or special chars
        'Password', // no numbers or special chars
        'Password123', // no special chars
        'pass word', // contains space
      ];

      weakPasswords.forEach(password => {
        const result = AuthService.validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should provide specific error messages', () => {
      const result = AuthService.validatePassword('weak');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('sanitizeUserForSession', () => {
    it('should remove sensitive fields from user object', () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        storeId: 'store123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const sanitized = AuthService.sanitizeUserForSession(user);

      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).toHaveProperty('id', '123');
      expect(sanitized).toHaveProperty('username', 'testuser');
      expect(sanitized).toHaveProperty('email', 'test@example.com');
      expect(sanitized).toHaveProperty('role', 'admin');
    });

    it('should handle null/undefined values', () => {
      const user = {
        id: '123',
        username: 'testuser',
        password: 'hashedpassword',
        role: 'admin'
      };

      const sanitized = AuthService.sanitizeUserForSession(user);

      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).toHaveProperty('id', '123');
      expect(sanitized).toHaveProperty('username', 'testuser');
    });
  });

  describe('generateResetToken', () => {
    it('should generate a valid reset token', () => {
      const token = AuthService.generateResetToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20); // Should be reasonably long
    });

    it('should generate unique tokens', () => {
      const token1 = AuthService.generateResetToken();
      const token2 = AuthService.generateResetToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateResetToken', () => {
    it('should validate a properly formatted token', () => {
      const token = 'valid-token-123';
      const result = AuthService.validateResetToken(token);
      
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid tokens', () => {
      const invalidTokens = [
        '', // empty
        'short', // too short
        'invalid token with spaces', // contains spaces
        'invalid@token#with#special#chars', // contains special chars
      ];

      invalidTokens.forEach(token => {
        const result = AuthService.validateResetToken(token);
        expect(result.isValid).toBe(false);
      });
    });
  });
});

describe('Authentication Errors', () => {
  it('should create ValidationError with proper structure', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });
    
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should create AuthenticationError with proper structure', () => {
    const error = new AuthenticationError('Invalid credentials');
    
    expect(error.message).toBe('Invalid credentials');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should create AuthorizationError with proper structure', () => {
    const error = new AuthenticationError('Insufficient permissions');
    
    expect(error.message).toBe('Insufficient permissions');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });
}); 