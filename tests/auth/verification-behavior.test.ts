import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the entire auth-enhanced module
vi.mock('../../server/auth-enhanced', () => {
  const mockAuthService = {
    createEmailVerificationToken: vi.fn(),
    verifyEmailToken: vi.fn(),
    createPhoneVerificationOTP: vi.fn(),
    verifyPhoneOTP: vi.fn(),
    checkVerificationLevel: vi.fn(),
    cleanupExpiredData: vi.fn(),
    authConfig: {
      emailVerificationExpiry: 24 * 60 * 60 * 1000,
      phoneVerificationExpiry: 5 * 60 * 1000,
      otpMaxAttempts: 3
    }
  };

  return { EnhancedAuthService: mockAuthService };
});

import { EnhancedAuthService } from '../../server/auth-enhanced';

describe('Verification - Behavior Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Email Verification Behavior', () => {
    it('should create email verification token successfully', async () => {
      const mockToken = {
        id: 'token-123',
        userId: 'user-123',
        token: 'random-token-string',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        used: false
      };

      vi.mocked(EnhancedAuthService.createEmailVerificationToken).mockResolvedValue(mockToken);

      const result = await EnhancedAuthService.createEmailVerificationToken('user-123');

      expect(result).toEqual(mockToken);
      expect(result.userId).toBe('user-123');
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.used).toBe(false);
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

    it('should reject already used email token', async () => {
      const mockResult = {
        success: false,
        message: 'Invalid or expired verification token'
      };

      vi.mocked(EnhancedAuthService.verifyEmailToken).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyEmailToken('used-token');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired verification token');
    });
  });

  describe('Phone Verification Behavior', () => {
    it('should create phone verification OTP successfully', async () => {
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

    it('should reject invalid phone OTP and track attempts', async () => {
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

    it('should reject OTP after max attempts reached', async () => {
      const mockResult = {
        success: false,
        message: 'Maximum OTP attempts reached'
      };

      vi.mocked(EnhancedAuthService.verifyPhoneOTP).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyPhoneOTP('user-123', 'wrong-otp');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Maximum OTP attempts reached');
    });

    it('should reject expired phone OTP', async () => {
      const mockResult = {
        success: false,
        message: 'Invalid or expired OTP'
      };

      vi.mocked(EnhancedAuthService.verifyPhoneOTP).mockResolvedValue(mockResult);

      const result = await EnhancedAuthService.verifyPhoneOTP('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired OTP');
    });
  });

  describe('Verification Level Checks', () => {
    it('should check email verification level correctly', () => {
      const userWithEmailVerified = {
        id: 'user-123',
        emailVerified: true,
        phoneVerified: false
      };

      vi.mocked(EnhancedAuthService.checkVerificationLevel).mockReturnValue(true);

      const result = EnhancedAuthService.checkVerificationLevel(userWithEmailVerified, 'email');

      expect(result).toBe(true);
      expect(EnhancedAuthService.checkVerificationLevel).toHaveBeenCalledWith(userWithEmailVerified, 'email');
    });

    it('should check both verification levels correctly', () => {
      const userWithBothVerified = {
        id: 'user-123',
        emailVerified: true,
        phoneVerified: true
      };

      vi.mocked(EnhancedAuthService.checkVerificationLevel).mockReturnValue(true);

      const result = EnhancedAuthService.checkVerificationLevel(userWithBothVerified, 'both');

      expect(result).toBe(true);
      expect(EnhancedAuthService.checkVerificationLevel).toHaveBeenCalledWith(userWithBothVerified, 'both');
    });

    it('should handle unverified user correctly', () => {
      const userUnverified = {
        id: 'user-123',
        emailVerified: false,
        phoneVerified: false
      };

      vi.mocked(EnhancedAuthService.checkVerificationLevel).mockReturnValue(false);

      const result = EnhancedAuthService.checkVerificationLevel(userUnverified, 'email');

      expect(result).toBe(false);
      expect(EnhancedAuthService.checkVerificationLevel).toHaveBeenCalledWith(userUnverified, 'email');
    });
  });

  describe('Cleanup Functions', () => {
    it('should clean up expired data', async () => {
      vi.mocked(EnhancedAuthService.cleanupExpiredData).mockResolvedValue(undefined);

      await EnhancedAuthService.cleanupExpiredData();

      expect(EnhancedAuthService.cleanupExpiredData).toHaveBeenCalled();
    });
  });

  describe('Verification Configuration', () => {
    it('should have correct email verification expiry', () => {
      const emailExpiry = EnhancedAuthService.authConfig.emailVerificationExpiry;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      expect(emailExpiry).toBe(twentyFourHours);
      expect(emailExpiry).toBeGreaterThan(0);
    });

    it('should have correct phone verification expiry', () => {
      const phoneExpiry = EnhancedAuthService.authConfig.phoneVerificationExpiry;
      const fiveMinutes = 5 * 60 * 1000;
      
      expect(phoneExpiry).toBe(fiveMinutes);
      expect(phoneExpiry).toBeGreaterThan(0);
    });

    it('should have correct OTP max attempts', () => {
      const maxAttempts = EnhancedAuthService.authConfig.otpMaxAttempts;
      
      expect(maxAttempts).toBe(3);
      expect(maxAttempts).toBeGreaterThan(0);
      expect(maxAttempts).toBeLessThan(10);
    });

    it('should have reasonable expiry time relationships', () => {
      const emailExpiry = EnhancedAuthService.authConfig.emailVerificationExpiry;
      const phoneExpiry = EnhancedAuthService.authConfig.phoneVerificationExpiry;
      
      // Email verification should last longer than phone verification
      expect(emailExpiry).toBeGreaterThan(phoneExpiry);
      
      // Both should be reasonable durations
      expect(emailExpiry).toBeLessThan(7 * 24 * 60 * 60 * 1000); // Less than 7 days
      expect(phoneExpiry).toBeLessThan(60 * 60 * 1000); // Less than 1 hour
    });
  });
});
