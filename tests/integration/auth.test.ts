import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { vi } from 'vitest';

import { PaymentService } from '@server/payment/service';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';
import { stageUserAndCompletePayment } from './helpers/pending-signup';

describe('Authentication Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    vi.spyOn(PaymentService.prototype, 'verifyPaystackPayment').mockResolvedValue(true);
    vi.spyOn(PaymentService.prototype, 'verifyFlutterwavePayment').mockResolvedValue(true);

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
    // Clear the users table after all tests
    const { users } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(users);
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Clear the storage and users table after each test
    await storage.clear();
  });

  afterEach(async () => {
    // Clear the storage and users table after each test
    await storage.clear();
    const { users } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(users);
  });

  describe('POST /api/auth/signup', () => {
    // DB is cleaned in afterEach to keep state during a single test block
    it('should stage a signup and require payment completion', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '+1234567890',
        companyName: 'Test Company',
        password: 'StrongPass123!',
        tier: 'basic',
        location: 'international'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(202);

      expect(response.body.message).toContain('Signup details saved');
      expect(response.body.pending).toBe(true);
      expect(typeof response.body.pendingToken).toBe('string');

      const pendingResponse = await request(app)
        .get('/api/auth/pending-signup')
        .query({ token: response.body.pendingToken })
        .expect(200);

      expect(pendingResponse.body.pending).toBe(true);
      expect(pendingResponse.body.data.email).toBe(userData.email);
      expect(pendingResponse.body.data).not.toHaveProperty('passwordHash');
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
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'duplicate@example.com',
        phone: '+1234567890',
        companyName: 'Test Company',
        password: 'StrongPass123!',
        tier: 'basic',
        location: 'international'
      };

      // Create first user and complete payment
      await stageUserAndCompletePayment(app, request, userData);

      // Try to create second user with same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.message).toBe('User with this email exists');
    });

    it('should create the first user as an admin after payment completion', async () => {
      const userData = {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        phone: '+1234567890',
        companyName: 'Admin Company',
        password: 'StrongPass123!',
        tier: 'enterprise',
        location: 'international'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(202);

      expect(response.body.pending).toBe(true);
      const pendingToken = response.body.pendingToken as string;

      const pendingResponse = await request(app)
        .get('/api/auth/pending-signup')
        .query({ token: pendingToken })
        .expect(200);

      expect(pendingResponse.body.pending).toBe(true);
      expect(pendingResponse.body.data.email).toBe(userData.email);

      // Complete payment using the staged reference
      await stageUserAndCompletePayment(app, request, userData);

      const createdUser = await storage.getUserByEmail('admin@example.com');
      expect(createdUser).toBeTruthy();
      expect((createdUser as any).role).toBe('admin');
      expect((createdUser as any).signupCompleted).toBe(true);
    });

    it('should block subsequent signups', async () => {
      // First user (admin) staged and completed
      await stageUserAndCompletePayment(app, request, {
        firstName: 'Admin',
        lastName: 'User',
        email: 'first@example.com',
        phone: '+1234567890',
        companyName: 'Admin Company',
        password: 'StrongPass123!',
        tier: 'enterprise',
        location: 'international'
      });

      // Second user
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Second',
          lastName: 'User',
          email: 'second@example.com',
          phone: '+1234567891',
          companyName: 'Second Company',
          password: 'StrongPass123!',
          tier: 'basic',
          location: 'international'
        })
        .expect(403);

      expect(response.body.message).toBe('Signup is disabled');
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
