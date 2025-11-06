import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

describe('Authentication Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Create a fresh Express app once for all tests
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Setup session middleware
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    }));

    // Register routes
    await registerRoutes(app);
  });

  afterAll(async () => {
    // Clear the users and subscription tables after all tests
    const { users, subscriptions, emailVerificationTokens } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(emailVerificationTokens);
    await db.delete(subscriptions);
    await db.delete(users);
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Clear storage and tables after each test
    await storage.clear();
    const { users, subscriptions, subscriptionPayments, emailVerificationTokens } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(subscriptionPayments);
    await db.delete(subscriptions);
    await db.delete(emailVerificationTokens);
    await db.delete(users);
  });

  afterEach(async () => {
    await storage.clear();
    const { users, subscriptions, subscriptionPayments, emailVerificationTokens } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(subscriptionPayments);
    await db.delete(subscriptions);
    await db.delete(emailVerificationTokens);
    await db.delete(users);
  });

  describe('POST /api/auth/signup', () => {
    let counter = 0;
    const makeSignupPayload = () => {
      counter += 1;
      const suffix = `${Date.now()}${counter}`;
      return {
        firstName: 'Test',
        lastName: `User${counter}`,
        email: `signup${suffix}@example.com`,
        phone: `+23480${(10000000 + counter).toString().slice(-8)}`,
        companyName: `Test Company ${counter}`,
        password: 'StrongPass123!',
        tier: 'basic',
        location: 'international'
      };
    };

    it('creates an account, issues email verification, and starts trial immediately', async () => {
      const userData = makeSignupPayload();

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.verifyEmailSent).toBe(true);
      expect(typeof response.body.trialEndsAt).toBe('string');
      expect(response.body.message).toContain('Please verify your email');

      const created = await storage.getUserByEmail(userData.email);
      expect(created).toBeTruthy();
      expect(created?.emailVerified).toBe(false);
      expect(created?.isActive).toBe(false);

      const { subscriptions, emailVerificationTokens } = await import('@shared/schema');
      const { db } = await import('@server/db');
      const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, created!.id));
      expect(subs).toHaveLength(1);
      expect(subs[0].status).toBe('trial');

      const tokens = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, created!.id));
      expect(tokens).toHaveLength(1);
      expect(tokens[0].isUsed).toBe(false);
    });

    it('should reject weak passwords', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+1234567890',
        companyName: 'Test Company',
        password: 'weak',
        tier: 'basic',
        location: 'international'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.message).toBe('Password does not meet security requirements');
      expect(response.body.errors).toBeDefined();
    });

    it('should reject duplicate email addresses', async () => {
      const userData = makeSignupPayload();

      // Create first user
      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Try to create second user with same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.message).toBe('User with this email exists');
    });

    it('marks the very first signup as admin while respecting SIGNUPS_ENABLED flag', async () => {
      const { loadEnv } = await import('@shared/env');
      const env = loadEnv(process.env);
      expect(env.SIGNUPS_ENABLED).toBe(true);

      const userData = makeSignupPayload();

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.status).toBe('success');

      const createdUser = await storage.getUserByEmail(userData.email);
      expect(createdUser).toBeTruthy();
      expect((createdUser as any).role).toBe('admin');
    });
    it('should require all fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({})
        .expect(400);

      // Server returns a field-specific validation message
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message).toContain('Invalid');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const testUser = await storage.createUser({
        username: 'testuser@example.com',
        password: 'StrongPass123!',
        email: 'testuser@example.com',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        companyName: 'Test Company',
        role: 'admin',
        tier: 'basic',
        location: 'international',
        isActive: true,
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'StrongPass123!'
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toHaveProperty('id', testUser.id);
      expect(response.body.user).toHaveProperty('email', testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject invalid credentials', async () => {
      await storage.createUser({
        username: 'testuser@example.com',
        password: 'StrongPass123!',
        email: 'testuser@example.com',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        companyName: 'Test Company',
        role: 'admin',
        tier: 'basic',
        location: 'international',
        isActive: true,
        emailVerified: true
      });
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'StrongPass123!'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should require username and password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Invalid email or password');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user data when authenticated', async () => {
      const testUser = await storage.createUser({
        username: 'testuser@example.com',
        password: 'StrongPass123!',
        email: 'testuser@example.com',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        companyName: 'Test Company',
        role: 'admin',
        tier: 'basic',
        location: 'international',
        isActive: true,
        emailVerified: true
      });

      // Login to get session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'StrongPass123!'
        });

      const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUser.id);
      expect(response.body).toHaveProperty('email', testUser.email);
    });

    it('should return 401 when not authenticated in a test environment', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });
  });

  describe('POST /api/auth/request-password-reset', () => {
    it('should send reset email for existing user', async () => {
      await storage.createUser({
        username: 'testuser@example.com',
        password: 'StrongPass123!',
        email: 'testuser@example.com',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        companyName: 'Test Company',
        role: 'admin',
        tier: 'basic',
        location: 'international',
        isActive: true,
        emailVerified: true
      });
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'testuser@example.com' })
        .expect(200);

      expect(response.body.message).toBe('If an account exists for this email, a password reset link has been sent.');
    });

    it('should not reveal if email exists or not', async () => {
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBe('If an account exists for this email, a password reset link has been sent.');
    });

    it('should require email field', async () => {
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Email is required');
    });
  });
});
