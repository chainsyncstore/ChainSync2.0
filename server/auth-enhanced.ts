import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { eq, and, lt, gte, or } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { User, EmailVerificationToken, UserSession } from '@shared/schema';
import { 
  users, 
  emailVerificationTokens, 
  phoneVerificationOTP, 
  accountLockoutLogs, 
  userSessions 
} from '@shared/schema';
import { db } from './db';
import { logger } from './lib/logger';

export interface AuthConfig {
  saltRounds: number;
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  emailVerificationExpiry: number;
  phoneVerificationExpiry: number;
  otpMaxAttempts: number;
  jwtSecret: string;
  jwtExpiry: number;
  refreshTokenExpiry: number;
}

export const authConfig: AuthConfig = {
  saltRounds: 12,
  sessionTimeout: 60 * 60 * 1000, // 1 hour
  maxLoginAttempts: 5,
  lockoutDuration: 30 * 60 * 1000, // 30 minutes
  emailVerificationExpiry: 24 * 60 * 60 * 1000, // 24 hours
  phoneVerificationExpiry: 5 * 60 * 1000, // 5 minutes
  otpMaxAttempts: 3,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiry: 15 * 60 * 1000, // 15 minutes
  refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  lockoutUntil?: Date;
  remainingAttempts?: number;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  error?: string;
}

export class EnhancedAuthService {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    return bcrypt.hash(password, authConfig.saltRounds);
  }

  /**
   * Compare a password with its hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Check if account is locked
   */
  static async isAccountLocked(userId: string): Promise<{ locked: boolean; lockoutUntil?: Date }> {
    const user = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user[0]) {
      return { locked: false };
    }

    const userData = user[0];
    
    // Check if account is locked due to failed attempts
    if (userData.lockedUntil && userData.lockedUntil > new Date()) {
      return { locked: true, lockoutUntil: userData.lockedUntil };
    }

    // Check if account should be locked due to failed attempts
    if (userData.failedLoginAttempts >= authConfig.maxLoginAttempts) {
      const lockoutUntil = new Date(Date.now() + authConfig.lockoutDuration);
      await db.update(users)
        .set({ lockedUntil: lockoutUntil } as any)
        .where(eq(users.id, userId));
      
      return { locked: true, lockoutUntil };
    }

    return { locked: false };
  }

  /**
   * Record failed login attempt
   */
  static async recordFailedLogin(userId: string, username: string, ipAddress: string, reason: string): Promise<void> {
    const user = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user[0]) {
      // Log attempt for non-existent user
      await db.insert(accountLockoutLogs).values({
        userId: undefined,
        username,
        ipAddress,
        action: 'login_attempt',
        success: false,
        reason,
        createdAt: new Date()
      } as unknown as typeof accountLockoutLogs.$inferInsert);
      return;
    }

    const userData = user[0];
    const newAttempts = (userData.failedLoginAttempts || 0) + 1;
    const lastFailedLogin = new Date();

    // Update user's failed login attempts
    await db.update(users)
      .set({ 
        failedLoginAttempts: newAttempts as any,
        lastFailedLogin
      } as any)
      .where(eq(users.id, userId));

    // Log the failed attempt
    await db.insert(accountLockoutLogs).values({
      userId,
      username,
      ipAddress,
      action: 'login_attempt',
      success: false,
      reason,
      createdAt: new Date()
    } as unknown as typeof accountLockoutLogs.$inferInsert);

    // Lock account if max attempts reached
    if (newAttempts >= authConfig.maxLoginAttempts) {
      const lockoutUntil = new Date(Date.now() + authConfig.lockoutDuration);
      await db.update(users)
        .set({ lockedUntil: lockoutUntil } as any)
        .where(eq(users.id, userId));
    }
  }

  /**
   * Reset failed login attempts on successful login
   */
  static async resetFailedLoginAttempts(userId: string): Promise<void> {
    await db.update(users)
      .set({ 
        failedLoginAttempts: 0 as unknown as number,
        lockedUntil: null as any,
        lastFailedLogin: null as any
      } as any)
      .where(eq(users.id, userId));
  }

  /**
   * Authenticate user with enhanced security
   */
  static async authenticateUser(username: string, password: string, ipAddress: string): Promise<LoginResult> {
    try {
      const user = await db.select().from(users).where(eq(users.username, username));
      
      if (!user[0] || !user[0].password) {
        await this.recordFailedLogin('', username, ipAddress, 'User not found');
        return { success: false, error: 'Invalid credentials' };
      }

      const userData = user[0];

      // Check if user is active
      if (!userData.isActive) {
        await this.recordFailedLogin(userData.id, username, ipAddress, 'Account disabled');
        return { success: false, error: 'Account is disabled' };
      }

      // Check if account is locked
      const lockStatus = await this.isAccountLocked(userData.id);
      if (lockStatus.locked) {
        return { 
          success: false, 
          error: 'Account is temporarily locked due to multiple failed login attempts',
          lockoutUntil: lockStatus.lockoutUntil
        };
      }

      // Check if email is verified (conditionally required for login)
      if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !userData.emailVerified) {
        return { 
          success: false, 
          error: 'Please verify your email address before logging in' 
        };
      }

      // Verify password
      const isPasswordValid = await this.comparePassword(password, userData.password);
      
      if (!isPasswordValid) {
        await this.recordFailedLogin(userData.id, username, ipAddress, 'Invalid password');
        
        const remainingAttempts = authConfig.maxLoginAttempts - (userData.failedLoginAttempts || 0) - 1;
        
        if (remainingAttempts <= 0) {
          const lockoutUntil = new Date(Date.now() + authConfig.lockoutDuration);
          return { 
            success: false, 
            error: 'Account locked due to multiple failed login attempts',
            lockoutUntil
          };
        }
        
        return { 
          success: false, 
          error: `Invalid password. ${remainingAttempts} attempts remaining before account lockout.`,
          remainingAttempts
        };
      }

      // Successful login - reset failed attempts
      await this.resetFailedLoginAttempts(userData.id);

      // Log successful login
    await db.insert(accountLockoutLogs).values({
        userId: userData.id,
        username,
        ipAddress,
        action: 'login_attempt',
        success: true,
        reason: 'Login successful',
        createdAt: new Date()
    } as unknown as typeof accountLockoutLogs.$inferInsert);

      return { success: true, user: userData };

    } catch (error) {
      logger.error('Authentication error', {
        username,
        ipAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Generate JWT tokens
   */
  static generateTokens(userId: string): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
      { userId, type: 'access' },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiry }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      authConfig.jwtSecret,
      { expiresIn: authConfig.refreshTokenExpiry }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      const payload = jwt.verify(token, authConfig.jwtSecret);
      return { valid: true, payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token expired' };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: 'Token verification failed' };
    }
  }

  /**
   * Create user session
   */
  static async createUserSession(userId: string, ipAddress?: string, userAgent?: string): Promise<UserSession> {
    const tokens = this.generateTokens(userId);
    
    const session = await db.insert(userSessions).values({
      userId,
      sessionToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + authConfig.jwtExpiry),
      refreshExpiresAt: new Date(Date.now() + authConfig.refreshTokenExpiry),
      isActive: true,
      createdAt: new Date(),
      lastUsedAt: new Date()
    } as unknown as typeof userSessions.$inferInsert).returning();

    return session[0];
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken: string): Promise<{ success: boolean; accessToken?: string; error?: string }> {
    try {
      const result = this.verifyToken(refreshToken);
      if (!result.valid) {
        return { success: false, error: result.error };
      }

      const payload = result.payload as any;
      if (payload.type !== 'refresh') {
        return { success: false, error: 'Invalid token type' };
      }

      // Check if refresh token exists and is valid in database
      const session = await db.select()
        .from(userSessions)
        .where(and(
          eq(userSessions.refreshToken, refreshToken),
          eq(userSessions.isActive, true),
          gte(userSessions.refreshExpiresAt, new Date())
        ));

      if (!session[0]) {
        return { success: false, error: 'Invalid or expired refresh token' };
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: payload.userId, type: 'access' },
        authConfig.jwtSecret,
        { expiresIn: authConfig.jwtExpiry }
      );

      // Update session
      await db.update(userSessions)
        .set({ 
          sessionToken: newAccessToken,
          expiresAt: new Date(Date.now() + authConfig.jwtExpiry),
          lastUsedAt: new Date()
        } as any)
        .where(eq(userSessions.id, session[0].id));

      return { success: true, accessToken: newAccessToken };

    } catch (error) {
      logger.error('Token refresh error', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false, error: 'Token refresh failed' };
    }
  }

  /**
   * Invalidate user session
   */
  static async invalidateSession(sessionId: string): Promise<void> {
    await db.update(userSessions)
      .set({ isActive: false } as any)
      .where(eq(userSessions.id, sessionId));
  }

  /**
   * Invalidate all user sessions
   */
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    await db.update(userSessions)
      .set({ isActive: false } as any)
      .where(eq(userSessions.userId, userId));
  }

  /**
   * Create email verification token
   */
  static async createEmailVerificationToken(userId: string): Promise<EmailVerificationToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + authConfig.emailVerificationExpiry);

    // Invalidate any existing tokens
    await db.update(emailVerificationTokens)
      .set({ isUsed: true } as any)
      .where(eq(emailVerificationTokens.userId, userId));

    const verificationToken = await db.insert(emailVerificationTokens).values({
      userId,
      token,
      expiresAt,
      isUsed: false,
      createdAt: new Date()
    } as unknown as typeof emailVerificationTokens.$inferInsert).returning();

    return verificationToken[0];
  }

  /**
   * Verify email verification token
   */
  static async verifyEmailToken(token: string): Promise<VerificationResult> {
    try {
      const verificationToken = await db.select()
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.token, token),
          eq(emailVerificationTokens.isUsed, false),
          gte(emailVerificationTokens.expiresAt, new Date())
        ));

      if (!verificationToken[0]) {
        return { success: false, message: 'Invalid or expired verification token' };
      }

      const tokenData = verificationToken[0];

      // Mark token as used
      await db.update(emailVerificationTokens)
        .set({ 
          isUsed: true as any,
          usedAt: new Date()
        } as any)
        .where(eq(emailVerificationTokens.id, tokenData.id));

      // Mark user as verified
      await db.update(users)
        .set({ emailVerified: true } as any)
        .where(eq(users.id, tokenData.userId));

      return { success: true, message: 'Email verified successfully' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Email verification error', { error: message });
      return { success: false, message: 'Email verification failed', error: message };
    }
  }

  /**
   * Create phone verification OTP
   */
  static async createPhoneVerificationOTP(userId: string, phone: string): Promise<VerificationResult> {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await this.hashPassword(otp);
      const expiresAt = new Date(Date.now() + authConfig.phoneVerificationExpiry);

      // Invalidate any existing OTP for this user
      await db.update(phoneVerificationOTP)
        .set({ isVerified: true } as any)
        .where(eq(phoneVerificationOTP.userId, userId));

      // Create new OTP
      await db.insert(phoneVerificationOTP).values({
        userId,
        phone,
        otpHash,
        expiresAt,
        attempts: 0,
        maxAttempts: authConfig.otpMaxAttempts,
        isVerified: false,
        createdAt: new Date()
      } as unknown as typeof phoneVerificationOTP.$inferInsert);

      // TODO: Send OTP via SMS service (Twilio, etc.)
      // For now, return the OTP in development
      if (process.env.NODE_ENV === 'development') {
        return { success: true, message: `OTP sent to ${phone}. Development OTP: ${otp}` };
      }

      return { success: true, message: `OTP sent to ${phone}` };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Phone verification OTP creation error', {
        userId,
        phone,
        error: message
      });
      return { success: false, message: 'Failed to create OTP', error: message };
    }
  }

  /**
   * Verify phone OTP
   */
  static async verifyPhoneOTP(userId: string, otp: string): Promise<VerificationResult> {
    try {
      const otpRecord = await db.select()
        .from(phoneVerificationOTP)
        .where(and(
          eq(phoneVerificationOTP.userId, userId),
          eq(phoneVerificationOTP.isVerified, false),
          gte(phoneVerificationOTP.expiresAt, new Date()),
          lt(phoneVerificationOTP.attempts, phoneVerificationOTP.maxAttempts)
        ));

      if (!otpRecord[0]) {
        return { success: false, message: 'Invalid or expired OTP' };
      }

      const otpData = otpRecord[0];

      // Check if max attempts reached
      if (otpData.attempts >= otpData.maxAttempts) {
        return { success: false, message: 'Maximum OTP attempts reached' };
      }

      // Verify OTP
      const isOtpValid = await this.comparePassword(otp, otpData.otpHash);

      if (!isOtpValid) {
        // Increment attempts
        await db.update(phoneVerificationOTP)
          .set({ attempts: (otpData.attempts || 0) + 1 } as any)
          .where(eq(phoneVerificationOTP.id, otpData.id));

        const remainingAttempts = otpData.maxAttempts - otpData.attempts - 1;
        return { 
          success: false, 
          message: `Invalid OTP. ${remainingAttempts} attempts remaining.` 
        };
      }

      // Mark OTP as verified
      await db.update(phoneVerificationOTP)
        .set({ 
          isVerified: true as any,
          verifiedAt: new Date()
        } as any)
        .where(eq(phoneVerificationOTP.id, otpData.id));

      // Mark user as phone verified
      await db.update(users)
        .set({ phoneVerified: true } as any)
        .where(eq(users.id, userId));

      return { success: true, message: 'Phone number verified successfully' };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Phone OTP verification error', {
        userId,
        error: message
      });
      return { success: false, message: 'Phone verification failed', error: message };
    }
  }

  /**
   * Validate user role permissions
   */
  static validateRoleAccess(userRole: string, requiredRole: string): boolean {
    const roleHierarchy = {
      'cashier': 1,
      'manager': 2,
      'admin': 3
    };
    
    const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
    const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;
    
    return userLevel >= requiredLevel;
  }

  /**
   * Sanitize user data for session storage (remove sensitive fields)
   */
  static sanitizeUserForSession(user: User): Omit<User, 'password'> {
    const { password: _password, ...sanitizedUser } = user;
    void _password;
    return sanitizedUser;
  }

  /**
   * Check if user has required verification level
   */
  static checkVerificationLevel(user: User, requiredLevel: 'email' | 'phone' | 'both'): boolean {
    switch (requiredLevel) {
      case 'email':
        return user.emailVerified === true;
      case 'phone':
        return user.phoneVerified === true;
      case 'both':
        return user.emailVerified === true && user.phoneVerified === true;
      default:
        return false;
    }
  }

  /**
   * Clean up expired tokens and sessions
   */
  static async cleanupExpiredData(): Promise<void> {
    try {
      const now = new Date();

      // Clean up expired email verification tokens
      await db.delete(emailVerificationTokens)
        .where(and(
          lt(emailVerificationTokens.expiresAt, now),
          eq(emailVerificationTokens.isUsed, false)
        ));

      // Clean up expired phone verification OTP
      await db.delete(phoneVerificationOTP)
        .where(and(
          lt(phoneVerificationOTP.expiresAt, now),
          eq(phoneVerificationOTP.isVerified, false)
        ));

      // Clean up expired sessions
      await db.delete(userSessions)
        .where(or(
          lt(userSessions.expiresAt, now),
          lt(userSessions.refreshExpiresAt, now)
        ));

      // Clean up old lockout logs (keep last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await db.delete(accountLockoutLogs)
        .where(lt(accountLockoutLogs.createdAt, thirtyDaysAgo));

    } catch (error) {
      logger.error('Auth cleanup error', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
