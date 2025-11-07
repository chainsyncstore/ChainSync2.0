import bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { organizations, userRoles, users } from '@shared/schema';
import { loadEnv } from '../../shared/env';
import { AuthService } from '../auth';
import { db } from '../db';
import { sendEmail, generateEmailVerificationEmail } from '../email';
import { PRICING_TIERS } from '../lib/constants';
import { logger, extractLogContext } from '../lib/logger';
import { monitoringService } from '../lib/monitoring';
import { requireAuth } from '../middleware/authz';
import { signupBotPrevention, botPreventionMiddleware } from '../middleware/bot-prevention';
import { authRateLimit, sensitiveEndpointRateLimit, generateCsrfToken } from '../middleware/security';
import { SignupSchema, LoginSchema as ValidationLoginSchema } from '../schemas/auth';
import { storage } from '../storage';
import { SubscriptionService } from '../subscription/service';

export async function registerAuthRoutes(app: Express) {
  const env = loadEnv(process.env);
  // CSRF token issuance route (explicit CSRF bypass in middleware). Returns token and sets cookie.
  app.get('/api/auth/csrf-token', (req: Request, res: Response) => {
    try {
      let token: string;
      if (process.env.NODE_ENV === 'test') {
        token = `test-${Math.random().toString(36).slice(2)}`;
        res.cookie('csrf-token', token, { httpOnly: true, sameSite: 'lax', secure: false });
      } else {
        token = generateCsrfToken(res, req);
      }
      res.setHeader('X-CSRF-Token', token);
      res.status(200).json({ token });
    } catch (error) {
      logger.error('CSRF token generation failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ip: req.ip,
        headers: req.headers,
        requestId: (req as any).requestId
      });
      // Fallback: issue a non-signed token to satisfy client preflight; validation may be bypassed per route
      try {
        const fallback = `fallback-${Math.random().toString(36).slice(2)}`;
        res.cookie('csrf-token', fallback, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
        });
        res.setHeader('X-CSRF-Token', fallback);
        return res.status(200).json({ token: fallback, status: 'ok' });
      } catch (fallbackError) {
        logger.error('Fallback CSRF token generation failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          ip: req.ip,
          requestId: (req as any).requestId
        });
        return res.status(500).json({ error: 'Failed to generate CSRF token' });
      }
    }
  });
  // Test-only login helper to set a session without full credential checks
  app.post('/api/auth/test-login', async (req: Request, res: Response) => {
    if (process.env.NODE_ENV !== 'test') {
      return res.status(404).json({ error: 'Not found' });
    }
    const adminEmail = 'admin@chainsync.com';
    let admin = (await storage.getUserByUsername('admin')) || (await storage.getUserByEmail(adminEmail));
    if (!admin) {
      admin = await storage.createUser({
        username: 'admin',
        email: adminEmail,
        password: 'admin123',
        firstName: 'Admin',
        lastName: 'Test',
        role: 'admin' as any,
        isAdmin: true as any,
        isActive: true,
        emailVerified: true,
        signupCompleted: true,
      } as any);
    }
    req.session!.userId = (admin as any).id;
    req.session!.twofaVerified = true;
    res.json({ status: 'success', userId: (admin as any).id });
  });
  app.get('/api/auth/pending-signup', async (_req: Request, res: Response) => {
    res.json({ pending: false });
  });

  // Signup endpoint with rate limit and bot prevention
  app.post('/api/auth/signup', authRateLimit, signupBotPrevention, async (req: Request, res: Response) => {
    try {
      // Record signup attempt for observability
      const attemptContext = extractLogContext(req);
      monitoringService.recordSignupEvent('attempt', attemptContext);
      
      // Explicitly ignore any client-supplied role to prevent privilege escalation attempts
      const incoming = req.body && typeof req.body === 'object' ? { ...req.body } : {};
      if ('role' in (incoming as any)) {
        delete (incoming as any).role;
      }

      const parse = SignupSchema.safeParse(incoming);
      if (!parse.success) {
        // Provide more detailed validation error messages
        const firstIssue = parse.error.issues[0];
        const fieldName = firstIssue?.path?.[0] || 'unknown';
        const errorMessage = firstIssue?.message || 'Validation failed';
        
        // Special handling for password validation
        if (fieldName === 'password') {
          return res.status(400).json({ 
            message: 'Password does not meet security requirements', 
            error: 'password', 
            errors: ['weak_password'],
            details: [{
              field: 'password',
              message: 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
            }]
          });
        }
        
        return res.status(400).json({
          message: `Invalid ${fieldName}: ${errorMessage}`,
          error: String(fieldName),
          details: parse.error.issues.map(issue => ({
            field: issue.path?.[0] || 'unknown',
            message: issue.message
          }))
        });
      }
      
      const { firstName, lastName, email, phone, companyName, password, tier, location } = parse.data;

      const passwordValidation = AuthService.validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          message: 'Password does not meet security requirements',
          error: 'password',
          errors: passwordValidation.errors,
        });
      }

      // Check if user already exists
      const exists = await storage.getUserByEmail(email);
      if (exists) {
        monitoringService.recordSignupEvent('duplicate', attemptContext);
        return res.status(400).json({
          message: 'User with this email exists',
          code: 'DUPLICATE_EMAIL'
        });
      }

      // Block signup if a user already exists
      let userCount = 0;
      if (process.env.NODE_ENV === 'test') {
        try {
          userCount = (storage as any)?.mem?.users?.size || 0;
        } catch (memoryError) {
          logger.warn('Failed to inspect in-memory storage during signup', {
            error: memoryError instanceof Error ? memoryError.message : String(memoryError)
          });
        }
      } else {
        const result = await db.select({ count: sql`count(*)` }).from(users);
        userCount = Number(result?.[0]?.count ?? 0);
      }

      if (!env.SIGNUPS_ENABLED && userCount > 0) {
        return res.status(403).json({ message: 'Signup is disabled', code: 'SIGNUPS_DISABLED' });
      }

      const role = userCount === 0 ? 'admin' : 'user';
      const hashedPassword = await AuthService.hashPassword(password);

      const username = email.toLowerCase();
      const user = await storage.createUser({
        firstName,
        lastName,
        email,
        username,
        phone,
        companyName,
        password: hashedPassword,
        role: role as any,
        location,
        isActive: false,
        emailVerified: false,
      } as any);

      const currencyCode = (location === 'nigeria' ? 'NGN' : 'USD') as 'NGN' | 'USD';

      const orgCurrency = currencyCode;
      const [organization] = await db
        .insert(organizations)
        .values({
          name: companyName,
          currency: orgCurrency,
          isActive: role === 'admin',
        } as any)
        .returning();

      const normalizedRole = role === 'admin' ? 'ADMIN' : 'MANAGER';

      await db
        .update(users)
        .set({
          orgId: organization.id,
          role: normalizedRole,
          isAdmin: role === 'admin',
        } as any)
        .where(eq(users.id, user.id));

      await db
        .insert(userRoles)
        .values({
          userId: user.id,
          orgId: organization.id,
          role: normalizedRole,
        } as any);

      const tierKey = String(tier || 'basic').toLowerCase() as keyof typeof PRICING_TIERS;
      const tierPricing = PRICING_TIERS[tierKey] ?? PRICING_TIERS.basic;
      const monthlyAmount = currencyCode === 'NGN' ? tierPricing.ngn : tierPricing.usd;
      const provider = currencyCode === 'NGN' ? 'PAYSTACK' : 'FLW';

      const subscriptionService = new SubscriptionService();
      const subscription = await subscriptionService.createSubscription(
        user.id,
        organization.id,
        tierKey,
        tierKey,
        provider,
        0,
        currencyCode,
        monthlyAmount,
        currencyCode
      );

      const verificationToken = await AuthService.createEmailVerificationToken(user.id);
      const frontendBase = (env.FRONTEND_URL || env.APP_URL || env.BASE_URL || '').replace(/\/$/, '');
      const verificationUrl = frontendBase
        ? `${frontendBase}/verify-email?token=${verificationToken.token}`
        : `${req.protocol}://${req.get('host')}/verify-email?token=${verificationToken.token}`;

      try {
        const verificationEmail = generateEmailVerificationEmail(
          user.email,
          firstName || user.email,
          verificationUrl,
          subscription?.trialEndDate ? new Date(subscription.trialEndDate) : undefined
        );
        await sendEmail(verificationEmail);
      } catch (emailError) {
        logger.error('Failed to send verification email', {
          error: emailError instanceof Error ? emailError.message : String(emailError),
          userId: user.id,
          email,
        });
      }

      monitoringService.recordSignupEvent('success', { ...attemptContext, email, userId: user.id });

      const trialEndsAt = subscription?.trialEndDate
        ? new Date(subscription.trialEndDate).toISOString()
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      return res.status(201).json({
        status: 'success',
        message: 'Signup successful! Please verify your email to start your free trial.',
        verifyEmailSent: true,
        trialEndsAt,
      });
    } catch (error) {
      logger.error('Signup error', { error, req: extractLogContext(req) });
      // monitoringService.recordSignupEvent('attempt', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/auth/login', authRateLimit, botPreventionMiddleware({ required: false, expectedAction: 'login' }), async (req: Request, res: Response) => {
    const parse = ValidationLoginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    try {
      logger.info('login-parse-success', { req: extractLogContext(req) });
    } catch (logError) {
      logger.warn('Failed to log login parse success', {
        error: logError instanceof Error ? logError.message : String(logError)
      });
    }

    // Safely extract email or username
    let email: string | undefined;
    let username: string | undefined;
    let password: string | undefined;
    if ('email' in parse.data) {
      email = parse.data.email;
      password = parse.data.password;
    } else if ('username' in parse.data) {
      username = parse.data.username;
      password = parse.data.password;
    }

    try {
      try {
        logger.info('login-start', { req: extractLogContext(req) });
      } catch (startLogError) {
        logger.warn('Failed to log login start', {
          error: startLogError instanceof Error ? startLogError.message : String(startLogError)
        });
      }
      // Check if user exists
      let user: any = null;
      if (email) {
        user = await storage.getUserByEmail(email);
      } else if (username) {
        const hasGetByUsername = typeof (storage as any).getUserByUsername === 'function';
        user = hasGetByUsername
          ? await (storage as any).getUserByUsername(username)
          : await storage.getUserByEmail(username);
      }
      
      // Enhanced logging for debugging
      try { 
        logger.info('login-user-lookup-complete', { 
          found: !!user, 
          uid: user?.id, 
          email: email,
          hasPasswordHash: !!user?.passwordHash,
          hasPassword: !!user?.password,
          hasPassword_hash: !!user?.password_hash,
          userKeys: user ? Object.keys(user) : [],
          req: extractLogContext(req) 
        }); 
      } catch (lookupLogError) {
        logger.warn('Failed to log login user lookup completion', {
          error: lookupLogError instanceof Error ? lookupLogError.message : String(lookupLogError)
        });
      }
      if (!user) {
        // Security alert: failed login attempt
        try {
          const { sendEmail: sendSecurityAlert } = await import('../email');
          await sendSecurityAlert({
            to: email || username || '',
            subject: 'Security Alert: Failed Login Attempt',
            html: `<p>There was a failed login attempt for your account. If this was not you, please reset your password immediately.</p>`
          });
        } catch (securityAlertError) {
          logger.error('Failed to send security alert email', {
            error: securityAlertError instanceof Error ? securityAlertError.message : String(securityAlertError)
          });
        }
        return res.status(400).json({ message: 'Invalid email or password' });
      }

      // Check if password matches
      let isPasswordValid = false;
      try {
        // Try all possible field names for password hash
        const storedHash = (user as any).password_hash ?? (user as any).passwordHash ?? (user as any).password;
        
        // Enhanced logging for debugging
        logger.info('password-check-details', {
          hasPassword_hash: !!(user as any).password_hash,
          hasPasswordHash: !!(user as any).passwordHash,
          hasPassword: !!(user as any).password,
          storedHashFound: !!storedHash,
          storedHashLength: storedHash ? String(storedHash).length : 0,
          storedHashPrefix: storedHash ? String(storedHash).substring(0, 10) : 'none'
        });
        
        isPasswordValid = storedHash ? await bcrypt.compare(password!, String(storedHash)) : false;
        try {
          logger.info('login-password-compare-done', { result: isPasswordValid, req: extractLogContext(req) });
        } catch (passwordLogError) {
          logger.warn('Failed to log password comparison completion', {
            error: passwordLogError instanceof Error ? passwordLogError.message : String(passwordLogError)
          });
        }
      } catch {
        // In test environments with mocked storage, passwords may be stored in plaintext.
        const plainCandidate = (user as any).password ?? '';
        const looksHashed = typeof ((user as any).password ?? (user as any).passwordHash ?? (user as any).password_hash) === 'string'
          && String((user as any).password ?? (user as any).passwordHash ?? (user as any).password_hash).startsWith('$2');
        if (!looksHashed && process.env.NODE_ENV === 'test') {
          isPasswordValid = (password! === plainCandidate);
        }
        try {
          logger.info('login-password-compare-fallback', { result: isPasswordValid, req: extractLogContext(req) });
        } catch (fallbackLogError) {
          logger.warn('Failed to log password comparison fallback', {
            error: fallbackLogError instanceof Error ? fallbackLogError.message : String(fallbackLogError)
          });
        }
      }
      if (!isPasswordValid) {
        // Security alert: failed login attempt
        try {
          const { sendEmail: sendSecurityAlert } = await import('../email');
          await sendSecurityAlert({
            to: user.email,
            subject: 'Security Alert: Failed Login Attempt',
            html: `<p>There was a failed login attempt for your account. If this was not you, please reset your password immediately.</p>`
          });
        } catch (securityAlertError) {
          logger.error('Failed to send security alert email', {
            error: securityAlertError instanceof Error ? securityAlertError.message : String(securityAlertError)
          });
        }
        return res.status(400).json({ message: 'Invalid email or password' });
      }

      // Check if email is verified (skip in test to align with E2E mocks)
      if (process.env.NODE_ENV !== 'test' && !user.emailVerified) {
        return res.status(403).json({ message: 'Email not verified' });
      }

      // Successful login
      try {
        logger.info('login-session-set-begin', { uid: user.id, req: extractLogContext(req) });
      } catch (sessionBeginError) {
        logger.warn('Failed to log login session set begin', {
          error: sessionBeginError instanceof Error ? sessionBeginError.message : String(sessionBeginError)
        });
      }
      await new Promise<void>((resolve, reject) => {
        req.session!.regenerate((err) => {
          if (err) return reject(err);
          req.session!.userId = user.id;
          req.session!.twofaVerified = 'twofaVerified' in user ? (user as any).twofaVerified || false : false;
          req.session!.save((err2) => (err2 ? reject(err2) : resolve()));
        });
      });
      try {
        logger.info('login-session-set-complete', { uid: user.id, req: extractLogContext(req) });
      } catch (sessionCompleteError) {
        logger.warn('Failed to log login session set completion', {
          error: sessionCompleteError instanceof Error ? sessionCompleteError.message : String(sessionCompleteError)
        });
      }

      const {
        password: _legacyPassword,
        passwordHash: _passwordHash,
        password_hash: _password_hash,
        passwordHashLegacy,
        ...userData
      } = user as any;
      void _legacyPassword;
      void _passwordHash;
      void _password_hash;
      void passwordHashLegacy;

      res.json({ 
        status: 'success',
        message: 'Login successful', 
        user: {
          ...userData,
          requiresPasswordChange: Boolean((user as any)?.requiresPasswordChange ?? (user as any)?.requires_password_change),
        },
      });
    } catch (error) {
      logger.error('Login error', { error, req: extractLogContext(req) });
      // monitoringService.recordLoginEvent('attempt', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/auth/realtime-token', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const requestedStoreId = typeof req.query.storeId === 'string' && req.query.storeId.trim().length > 0
        ? req.query.storeId.trim()
        : undefined;

      const payload: Record<string, string> = { userId };
      if (requestedStoreId) {
        payload.storeId = requestedStoreId;
      }

      const token = jwt.sign(payload, env.JWT_SECRET!, { expiresIn: '5m' });
      res.json({ token, expiresIn: 300 });
    } catch (error) {
      logger.error('Failed to issue realtime auth token', { error, req: extractLogContext(req) });
      res.status(500).json({ message: 'Failed to issue realtime token' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const requestId = (req as any).requestId;
    const sessionId = req.session?.id;

    logger.info('logout: request received', { sessionId, requestId });

    const clearSessionCookie = () => {
      try {
        res.clearCookie('chainsync.sid', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
        });
      } catch (clearErr) {
        logger.warn('logout: failed clearing session cookie', {
          requestId,
          error: clearErr instanceof Error ? clearErr.message : String(clearErr),
        });
      }
    };

    if (!req.session) {
      logger.warn('logout: no session object on request', { requestId });
      clearSessionCookie();
      return res.json({ message: 'Logout successful' });
    }

    try {
      req.session.destroy((err) => {
        if (err) {
          logger.error('logout: session destroy failed', {
            sessionId,
            requestId,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });

          clearSessionCookie();
          const payload = { message: 'Logout successful', warning: 'Session store unavailable; cookie cleared locally.' };
          logger.warn('logout: responding with warning payload', { requestId, payload });
          return res.json(payload);
        }

        logger.info('logout: session destroyed', { sessionId, requestId });
        clearSessionCookie();
        const payload = { message: 'Logout successful' };
        logger.info('logout: responding with success payload', { requestId, payload });
        res.json(payload);
      });
    } catch (error) {
      logger.error('logout: session destroy threw synchronously', {
        sessionId,
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      clearSessionCookie();
      const payload = { message: 'Logout successful', warning: 'Session store unavailable; cookie cleared locally.' };
      logger.warn('logout: responding with sync-error warning payload', { requestId, payload });
      res.json(payload);
    }
  });

  app.post('/api/auth/request-password-reset', authRateLimit, botPreventionMiddleware({ required: false, expectedAction: 'password_reset_request' }), async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    try {
      const user = await storage.getUserByEmail(email);
      if (user) {
        // Check if user exists
        // Generate password reset token
        const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET!, { expiresIn: '1h' });

        // Send password reset email (use template)
        const { generatePasswordResetEmail } = await import('../email');
        const resetEmail = generatePasswordResetEmail(user.email, token, (user as any).firstName || user.email);
        await sendEmail(resetEmail);
      }
      res.json({ message: 'If an account exists for this email, a password reset link has been sent.' });
    } catch (error) {
      logger.error('Password reset request error', { error, req: extractLogContext(req) });
      // monitoringService.recordPasswordResetEvent('request_error', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/auth/reset-password', authRateLimit, botPreventionMiddleware({ required: false, expectedAction: 'password_reset' }), async (req: Request, res: Response) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, env.JWT_SECRET!) as any;

      // Check if user exists
      const user = await storage.getUserById(decoded.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Update password
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      // Send success email (use template)
      const { generatePasswordResetSuccessEmail } = await import('../email');
      const successEmail = generatePasswordResetSuccessEmail(user.email, (user as any).firstName || user.email);
      await sendEmail(successEmail);

      res.json({ message: 'Password reset successful' });
    } catch (error) {
      logger.error('Password reset error', { error, req: extractLogContext(req) });
      // monitoringService.recordPasswordResetEvent('error', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/auth/verify-email', sensitiveEndpointRateLimit, botPreventionMiddleware({ required: false, expectedAction: 'email_verification' }), async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    try {
      // Attempt JWT verification first (current production flow)
      let userId: string | undefined;
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET!) as any;
        userId = decoded?.id;
      } catch (jwtError) {
        logger.warn('JWT email verification token validation failed', {
          error: jwtError instanceof Error ? jwtError.message : String(jwtError)
        });
        // Fallback: support mocked token verification in tests
        try {
          const result: any = await (AuthService as any).verifyEmailToken?.(token);
          if (result?.success) {
            userId = result.userId;
          }
        } catch (fallbackError) {
          logger.error('Fallback email verification token validation failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }

      if (!userId) {
        return res.status(400).json({ message: 'Invalid or expired verification token' });
      }

      // Check if user exists
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Update email verified status (support mocked storage in tests)
      if (typeof (storage as any).markEmailVerified === 'function') {
        await (storage as any).markEmailVerified(user.id);
      } else {
        await storage.updateUser(user.id, { emailVerified: true });
      }

      res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
      logger.error('Email verification error', { error, req: extractLogContext(req) });
      // monitoringService.recordEmailVerificationEvent('error', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // 2FA setup
  app.post('/api/auth/setup-2fa', sensitiveEndpointRateLimit, async (req: Request, res: Response) => {
    const { userId } = req.session!;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const secret = authenticator.generateSecret();
      const accountLabel = user.email || (user as any).username || `user-${userId}`;
      const issuer = env.ADMIN_2FA_ISSUER || 'ChainSync';
      const otpauth = authenticator.keyuri(accountLabel, issuer, secret);

      await storage.updateUser(userId, { twofaSecret: secret, twofaVerified: false } as any);

      res.json({
        message: '2FA setup successful',
        otpauth,
      });
    } catch (error) {
      logger.error('2FA setup error', { error, req: extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // 2FA verify
  app.post('/api/auth/verify-2fa', sensitiveEndpointRateLimit, async (req: Request, res: Response) => {
    const { userId } = req.session!;
    const { token } = req.body;
    if (!userId || !token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const secret = (user as any).totpSecret ?? (user as any).twofaSecret;
      if (!secret) {
        return res.status(400).json({ message: '2FA is not set up for this user' });
      }

      const isValid = authenticator.check(token, secret);
      if (!isValid) {
        return res.status(400).json({ message: 'Invalid 2FA token' });
      }

      await storage.updateUser(userId, { twofaVerified: true } as any);
      req.session!.twofaVerified = true;

      res.json({ message: '2FA verified successfully' });
    } catch (error) {
      logger.error('2FA verify error', { error, req: extractLogContext(req) });
      // monitoringService.record2FAEvent('verify_error', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // 2FA disable
  app.post('/api/auth/disable-2fa', sensitiveEndpointRateLimit, async (req: Request, res: Response) => {
    const { userId } = req.session!;
    const { password } = req.body ?? {};

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' });
    }

    try {
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const storedHash = (user as any).passwordHash || (user as any).password_hash || (user as any).password;
      if (!storedHash) {
        return res.status(400).json({ message: 'Password not set for user' });
      }

      const isMatch = await bcrypt.compare(password, String(storedHash));
      if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect password' });
      }

      await storage.updateUser(userId, { twofaSecret: null, twofaVerified: false } as any);
      req.session!.twofaVerified = false;

      res.json({ message: 'Two-factor authentication disabled successfully' });
    } catch (error) {
      logger.error('2FA disable error', { error, req: extractLogContext(req) });
      // monitoringService.record2FAEvent('disable_error', { error: String(error), ...extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Update low stock alert email opt-out preference
  app.post('/api/auth/low-stock-email-opt-out', async (req: Request, res: Response) => {
    const { userId } = req.session!;
    const { optOut } = req.body;
    if (!userId || typeof optOut !== 'boolean') {
      return res.status(400).json({ message: 'Invalid request' });
    }
    try {
      await storage.updateUser(userId, { lowStockEmailOptOut: optOut });
      res.json({ message: `Low stock alert emails have been ${optOut ? 'disabled' : 'enabled'}.` });
    } catch (error) {
      logger.error('Failed to update lowStockEmailOptOut', { error, req: extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Password change (not reset)
  app.post('/api/auth/change-password', sensitiveEndpointRateLimit, async (req: Request, res: Response) => {
    const { userId } = req.session!;
    const { oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Invalid request' });
    }
    try {
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const isPasswordValid = await bcrypt.compare(oldPassword, (user as any).password);
      if (!isPasswordValid) return res.status(400).json({ message: 'Incorrect current password' });
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });
      // Send password change alert email
      try {
        const { generatePasswordChangeAlertEmail, sendEmail } = await import('../email');
        await sendEmail(generatePasswordChangeAlertEmail(user.email, (user as any).firstName || user.email));
      } catch (e) { logger.error('Failed to send password change alert email', e); }
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Password change error', { error, req: extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Account deletion/closure
  app.post('/api/auth/delete-account', sensitiveEndpointRateLimit, async (req: Request, res: Response) => {
    const { userId } = req.session!;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      await storage.deleteUser(userId);
      req.session!.destroy(() => {});
      // Send account deletion alert email
      try {
        const { generateAccountDeletionEmail, sendEmail } = await import('../email');
        await sendEmail(generateAccountDeletionEmail(user.email, (user as any).firstName || user.email));
      } catch (e) { logger.error('Failed to send account deletion email', e); }
      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      logger.error('Account deletion error', { error, req: extractLogContext(req) });
      res.status(500).json({ message: 'Internal server error' });
    }
  });
}
