import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the entire auth-enhanced module
vi.mock('../../server/auth-enhanced', () => {
  const mockAuthConfig = {
    saltRounds: 12,
    sessionTimeout: 60 * 60 * 1000,
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000,
    emailVerificationExpiry: 24 * 60 * 60 * 1000,
    phoneVerificationExpiry: 5 * 60 * 1000,
    otpMaxAttempts: 3,
    jwtSecret: 'test-secret',
    jwtExpiry: 15 * 60 * 1000,
    refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000
  };

  const mockAuthService = {
    hashPassword: vi.fn(),
    comparePassword: vi.fn(),
    isAccountLocked: vi.fn(),
    recordFailedLogin: vi.fn(),
    resetFailedLoginAttempts: vi.fn(),
    authenticateUser: vi.fn(),
    generateTokens: vi.fn(),
    verifyToken: vi.fn(),
    createUserSession: vi.fn(),
    refreshAccessToken: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllUserSessions: vi.fn(),
    createEmailVerificationToken: vi.fn(),
    verifyEmailToken: vi.fn(),
    createPhoneVerificationOTP: vi.fn(),
    verifyPhoneOTP: vi.fn(),
    validateRoleAccess: vi.fn(),
    sanitizeUserForSession: vi.fn(),
    checkVerificationLevel: vi.fn(),
    cleanupExpiredData: vi.fn()
  } as Record<string, any>;

  return { EnhancedAuthService: mockAuthService, authConfig: mockAuthConfig };
});

import type { EmailVerificationToken, User, UserSession } from '@shared/schema';
import { EnhancedAuthService, authConfig } from '../../server/auth-enhanced';

describe('EnhancedAuthService - Behavior Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Behavior', () => {
    it('should successfully authenticate valid user credentials', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        emailVerified: true,
        phoneVerified: false
      } as unknown as User;

      const mockResult = {
        success: true,
        user: mockUser
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('testuser', 'password123', '192.168.1.1');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(EnhancedAuthService.authenticateUser).toHaveBeenCalledWith('testuser', 'password123', '192.168.1.1');
    });

    it('should reject authentication for locked account', async () => {
      const mockResult = {
        success: false,
        error: 'Account is temporarily locked',
        lockoutUntil: new Date(Date.now() + 30 * 60 * 1000)
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('lockeduser', 'password123', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Account is temporarily locked');
      expect(result.lockoutUntil).toBeInstanceOf(Date);
    });

    it('should reject authentication for unverified email', async () => {
      const mockResult = {
        success: false,
        error: 'Please verify your email address'
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('unverifieduser', 'password123', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Please verify your email address');
    });

    it('should reject authentication with invalid password and track attempts', async () => {
      const mockResult = {
        success: false,
        error: 'Invalid password',
        remainingAttempts: 2
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('validuser', 'wrongpassword', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid password');
      expect(result.remainingAttempts).toBe(2);
    });
  });

  describe('Account Lockout Behavior', () => {
    it('should detect locked account correctly', async () => {
      const mockResult = {
        locked: true,
        lockoutUntil: new Date(Date.now() + 30 * 60 * 1000)
      };

      vi.mocked(EnhancedAuthService.isAccountLocked).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.isAccountLocked('user-123');

      expect(result.locked).toBe(true);
      expect(result.lockoutUntil).toBeInstanceOf(Date);
      expect(EnhancedAuthService.isAccountLocked).toHaveBeenCalledWith('user-123');
    });

    it('should detect unlocked account correctly', async () => {
      const mockResult = {
        locked: false
      };

      vi.mocked(EnhancedAuthService.isAccountLocked).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.isAccountLocked('user-123');

      expect(result.locked).toBe(false);
      expect(result.lockoutUntil).toBeUndefined();
    });

    it('should record failed login attempts', async () => {
      vi.mocked(EnhancedAuthService.recordFailedLogin).mockResolvedValue(undefined);

      await EnhancedAuthService.recordFailedLogin('user-123', 'testuser', '192.168.1.1', 'Invalid password');

      expect(EnhancedAuthService.recordFailedLogin).toHaveBeenCalledWith('user-123', 'testuser', '192.168.1.1', 'Invalid password');
    });

    it('should reset failed login attempts on successful login', async () => {
      vi.mocked(EnhancedAuthService.resetFailedLoginAttempts).mockResolvedValue(undefined);

      await EnhancedAuthService.resetFailedLoginAttempts('user-123');

      expect(EnhancedAuthService.resetFailedLoginAttempts).toHaveBeenCalledWith('user-123');
    });
  });

  describe('Email Verification Behavior', () => {
    it('should create email verification token', async () => {
      const mockToken: EmailVerificationToken = {
        id: 'token-123',
        userId: 'user-123',
        token: 'random-token-string',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isUsed: false,
        createdAt: new Date(),
        usedAt: null as unknown as Date
      };

      vi.mocked(EnhancedAuthService.createEmailVerificationToken).mockResolvedValue(mockToken);

      const result = await EnhancedAuthService.createEmailVerificationToken('user-123');

      expect(result).toEqual(mockToken);
      expect(result.userId).toBe('user-123');
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.isUsed).toBe(false);
      expect(EnhancedAuthService.createEmailVerificationToken).toHaveBeenCalledWith('user-123');
    });

    it('should verify valid email token', async () => {
      const mockResult = {
        success: true,
        message: 'Email verified successfully'
      };

      vi.mocked(EnhancedAuthService.verifyEmailToken).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyEmailToken('valid-token');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
      expect(EnhancedAuthService.verifyEmailToken).toHaveBeenCalledWith('valid-token');
    });

    it('should reject expired email token', async () => {
      const mockResult = {
        success: false,
        message: 'Invalid or expired verification token'
      };

      vi.mocked(EnhancedAuthService.verifyEmailToken).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyEmailToken('expired-token');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired verification token');
    });
  });

  describe('Phone Verification Behavior', () => {
    it('should create phone verification OTP', async () => {
      const mockResult = {
        success: true,
        message: 'OTP sent to +1234567890'
      };

      vi.mocked(EnhancedAuthService.createPhoneVerificationOTP).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.createPhoneVerificationOTP('user-123', '+1234567890');

      expect(result.success).toBe(true);
      expect(result.message).toContain('OTP sent to');
      expect(EnhancedAuthService.createPhoneVerificationOTP).toHaveBeenCalledWith('user-123', '+1234567890');
    });

    it('should verify valid phone OTP', async () => {
      const mockResult = {
        success: true,
        message: 'Phone number verified successfully'
      };

      vi.mocked(EnhancedAuthService.verifyPhoneOTP).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyPhoneOTP('user-123', '123456');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Phone number verified successfully');
      expect(EnhancedAuthService.verifyPhoneOTP).toHaveBeenCalledWith('user-123', '123456');
    });

    it('should reject invalid phone OTP', async () => {
      const mockResult = {
        success: false,
        message: 'Invalid OTP. 2 attempts remaining'
      };

      vi.mocked(EnhancedAuthService.verifyPhoneOTP).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyPhoneOTP('user-123', 'wrong-otp');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid OTP');
      expect(result.message).toContain('2 attempts remaining');
    });
  });

  describe('Token Management Behavior', () => {
    it('should generate access and refresh tokens', () => {
      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456'
      };

      vi.mocked(EnhancedAuthService.generateTokens).mockReturnValue(mockTokens);

      const result = EnhancedAuthService.generateTokens('user-123');

      expect(result).toEqual(mockTokens);
      expect(EnhancedAuthService.generateTokens).toHaveBeenCalledWith('user-123');
    });

    it('should verify valid token', () => {
      const mockResult = {
        valid: true,
        payload: { userId: 'user-123', iat: Date.now() }
      };

      vi.mocked(EnhancedAuthService.verifyToken).mockReturnValue(mockResult);

      const result = EnhancedAuthService.verifyToken('valid-token');

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(EnhancedAuthService.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should reject invalid token', () => {
      const mockResult = {
        valid: false,
        error: 'Token expired'
      };

      vi.mocked(EnhancedAuthService.verifyToken).mockReturnValue(mockResult);

      const result = EnhancedAuthService.verifyToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });
  });

  describe('Session Management Behavior', () => {
    it('should create user session', async () => {
      const now = new Date();
      const mockSession: UserSession = {
        id: 'session-123',
        userId: 'user-123',
        sessionToken: 'session-token-123',
        refreshToken: 'refresh-token-456',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        refreshExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: now,
        lastUsedAt: now
      };

      vi.mocked(EnhancedAuthService.createUserSession).mockResolvedValue(mockSession);

      const result = await EnhancedAuthService.createUserSession('user-123', '192.168.1.1', 'test-agent');

      expect(result).toEqual(mockSession);
      expect(EnhancedAuthService.createUserSession).toHaveBeenCalledWith('user-123', '192.168.1.1', 'test-agent');
    });

    it('should refresh access token', async () => {
      const mockResult = {
        success: true,
        accessToken: 'new-access-token-123'
      };

      vi.mocked(EnhancedAuthService.refreshAccessToken).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.refreshAccessToken('valid-refresh-token');

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('new-access-token-123');
      expect(EnhancedAuthService.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should invalidate session', async () => {
      vi.mocked(EnhancedAuthService.invalidateSession).mockResolvedValue(undefined);

      await EnhancedAuthService.invalidateSession('session-123');

      expect(EnhancedAuthService.invalidateSession).toHaveBeenCalledWith('session-123');
    });
  });

  describe('Utility Functions Behavior', () => {
    it('should validate role access correctly', () => {
      vi.mocked(EnhancedAuthService.validateRoleAccess).mockReturnValue(true);

      const result = EnhancedAuthService.validateRoleAccess('admin', 'manager');

      expect(result).toBe(true);
      expect(EnhancedAuthService.validateRoleAccess).toHaveBeenCalledWith('admin', 'manager');
    });

    it('should sanitize user data for session', () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed-password',
        role: 'admin'
      } as unknown as User;

      const mockSanitizedUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      } as Omit<User, 'password'>;

      vi.mocked(EnhancedAuthService.sanitizeUserForSession).mockReturnValue(mockSanitizedUser);

      const result = EnhancedAuthService.sanitizeUserForSession(mockUser);

      expect(result).toEqual(mockSanitizedUser);
      expect((result as Record<string, unknown>).password).toBeUndefined();
      expect(EnhancedAuthService.sanitizeUserForSession).toHaveBeenCalledWith(mockUser);
    });

    it('should check verification level correctly', () => {
      const mockUser = {
        id: 'user-123',
        emailVerified: true,
        phoneVerified: false
      } as unknown as User;

      vi.mocked(EnhancedAuthService.checkVerificationLevel).mockReturnValue(true);

      const result = EnhancedAuthService.checkVerificationLevel(mockUser, 'email');

      expect(result).toBe(true);
      expect(EnhancedAuthService.checkVerificationLevel).toHaveBeenCalledWith(mockUser, 'email');
    });
  });

  describe('Configuration Behavior', () => {
    it('should have correct authentication configuration', () => {
      expect(authConfig.maxLoginAttempts).toBe(5);
      expect(authConfig.lockoutDuration).toBe(30 * 60 * 1000);
      expect(authConfig.emailVerificationExpiry).toBe(24 * 60 * 60 * 1000);
      expect(authConfig.phoneVerificationExpiry).toBe(5 * 60 * 1000);
      expect(authConfig.otpMaxAttempts).toBe(3);
      expect(authConfig.jwtExpiry).toBe(15 * 60 * 1000);
      expect(authConfig.refreshTokenExpiry).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
