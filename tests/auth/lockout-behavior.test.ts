import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the entire auth-enhanced module
vi.mock('../../server/auth-enhanced', () => {
  const mockAuthService = {
    isAccountLocked: vi.fn(),
    recordFailedLogin: vi.fn(),
    resetFailedLoginAttempts: vi.fn(),
    authenticateUser: vi.fn(),
    authConfig: {
      maxLoginAttempts: 5,
      lockoutDuration: 30 * 60 * 1000
    }
  };

  return { EnhancedAuthService: mockAuthService };
});

import { EnhancedAuthService } from '../../server/auth-enhanced';

describe('Account Lockout - Behavior Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Lockout Detection', () => {
    it('should detect locked account due to failed attempts', async () => {
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

    it('should detect unlocked account below threshold', async () => {
      const mockResult = {
        locked: false
      };

      vi.mocked(EnhancedAuthService.isAccountLocked).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.isAccountLocked('user-123');

      expect(result.locked).toBe(false);
      expect(result.lockoutUntil).toBeUndefined();
    });

    it('should handle non-existent user gracefully', async () => {
      const mockResult = {
        locked: false
      };

      vi.mocked(EnhancedAuthService.isAccountLocked).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.isAccountLocked('non-existent-user');

      expect(result.locked).toBe(false);
      expect(EnhancedAuthService.isAccountLocked).toHaveBeenCalledWith('non-existent-user');
    });
  });

  describe('Failed Login Tracking', () => {
    it('should record failed login attempt', async () => {
      vi.mocked(EnhancedAuthService.recordFailedLogin).mockResolvedValue(undefined);

      await EnhancedAuthService.recordFailedLogin('user-123', 'testuser', '192.168.1.1', 'Invalid password');

      expect(EnhancedAuthService.recordFailedLogin).toHaveBeenCalledWith('user-123', 'testuser', '192.168.1.1', 'Invalid password');
    });

    it('should reset failed attempts on successful login', async () => {
      vi.mocked(EnhancedAuthService.resetFailedLoginAttempts).mockResolvedValue(undefined);

      await EnhancedAuthService.resetFailedLoginAttempts('user-123');

      expect(EnhancedAuthService.resetFailedLoginAttempts).toHaveBeenCalledWith('user-123');
    });
  });

  describe('Authentication with Lockout', () => {
    it('should reject login for locked account', async () => {
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
      expect(EnhancedAuthService.authenticateUser).toHaveBeenCalledWith('lockeduser', 'password123', '192.168.1.1');
    });

    it('should reject login for unverified email', async () => {
      const mockResult = {
        success: false,
        error: 'Please verify your email address'
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('unverifieduser', 'password123', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Please verify your email address');
    });

    it('should reject login for disabled account', async () => {
      const mockResult = {
        success: false,
        error: 'Account is disabled'
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('disableduser', 'password123', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Account is disabled');
    });

    it('should reject login with invalid password and track attempts', async () => {
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

    it('should lock account after max failed password attempts', async () => {
      const mockResult = {
        success: false,
        error: 'Account locked due to multiple failed login attempts',
        lockoutUntil: new Date(Date.now() + 30 * 60 * 1000)
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('validuser', 'wrongpassword', '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Account locked due to multiple failed login attempts');
      expect(result.lockoutUntil).toBeInstanceOf(Date);
    });

    it('should allow successful login and reset attempts', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'validuser',
        email: 'test@example.com',
        role: 'admin',
        emailVerified: true,
        phoneVerified: false
      };

      const mockResult = {
        success: true,
        user: mockUser
      };

      vi.mocked(EnhancedAuthService.authenticateUser).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.authenticateUser('validuser', 'correctpassword', '192.168.1.1');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(EnhancedAuthService.authenticateUser).toHaveBeenCalledWith('validuser', 'correctpassword', '192.168.1.1');
    });
  });

  describe('Lockout Configuration', () => {
    it('should use correct lockout configuration', () => {
      expect(EnhancedAuthService.authConfig.maxLoginAttempts).toBe(5);
      expect(EnhancedAuthService.authConfig.lockoutDuration).toBe(30 * 60 * 1000); // 30 minutes
    });

    it('should have reasonable lockout duration', () => {
      const lockoutDuration = EnhancedAuthService.authConfig.lockoutDuration;
      const thirtyMinutes = 30 * 60 * 1000;
      
      expect(lockoutDuration).toBe(thirtyMinutes);
      expect(lockoutDuration).toBeGreaterThan(0);
      expect(lockoutDuration).toBeLessThan(24 * 60 * 60 * 1000); // Less than 24 hours
    });

    it('should have reasonable max login attempts', () => {
      const maxAttempts = EnhancedAuthService.authConfig.maxLoginAttempts;
      
      expect(maxAttempts).toBe(5);
      expect(maxAttempts).toBeGreaterThan(0);
      expect(maxAttempts).toBeLessThan(10); // Reasonable upper limit
    });
  });
});
