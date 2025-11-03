import request from 'supertest';
import express, { type Express } from 'express';
import session from 'express-session';

import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
    // Clear the users table after all tests
    const { users } = await import('@shared/schema');
    const { db } = await import('@server/db');
    await db.delete(users);
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
    it('should create a new user account successfully', async () => {
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
        .expect(201);

      expect(response.body.message).toBe('Signup successful, please verify your email');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('password');
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

    it('should create the first user as an admin', async () => {
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
        .expect(201);

      expect(response.body.message).toBe('Signup successful, please verify your email');
      const createdUser = await storage.getUserByEmail('admin@example.com');
      expect(createdUser).toBeTruthy();
      expect((createdUser as any).role).toBe('admin');
    });

    it('should block subsequent signups', async () => {
      // First user (admin)
      await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Admin',
          lastName: 'User',
          email: 'first@example.com',
          phone: '+1234567890',
          companyName: 'Admin Company',
          password: 'StrongPass123!',
          tier: 'enterprise',
          location: 'international'
        })
        .expect(201);

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
