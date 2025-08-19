import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';
import { AuthService } from '@server/auth';

describe('Authentication Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    // Create a fresh Express app for each test
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

  describe('POST /api/auth/signup', () => {
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

      expect(response.body.message).toBe('Account created successfully');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.store).toHaveProperty('id');
      expect(response.body.store.name).toBe(userData.companyName);
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

      expect(response.body.message).toBe('User with this email already exists');
    });

    it('should ignore any provided role and always create admin', async () => {
      const userData: any = {
        firstName: 'Role',
        lastName: 'Attempt',
        email: 'role-attempt@example.com',
        phone: '+12345678901',
        companyName: 'Role Co',
        password: 'StrongPass123!',
        tier: 'basic',
        location: 'international',
        role: 'manager' // malicious/erroneous client attempt
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('Account created successfully');
      expect(response.body.user).toHaveProperty('id');

      // Fetch the created user and assert effective role is admin
      // The /api/auth/me returns minimal data; use storage to read the full user in test env
      const created = await storage.getUserByEmail('role-attempt@example.com');
      expect(created).toBeTruthy();
      // In this codebase, admin is represented either by role 'admin' or flag isAdmin in prd schema paths
      const effectiveIsAdmin = (created as any).role === 'admin' || (created as any).isAdmin === true;
      expect(effectiveIsAdmin).toBe(true);
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
    let testUser: any;

    beforeEach(async () => {
      // Create a test user
      testUser = await storage.createUser({
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
        isActive: true
      });

      // Create a store for the user
      await storage.createStore({
        name: 'Test Store',
        ownerId: testUser.id,
        address: 'Test Address',
        phone: '+1234567890',
        email: 'testuser@example.com',
        isActive: true
      });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser@example.com',
          password: 'StrongPass123!'
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('id', testUser.id);
      expect(response.body.data).toHaveProperty('email', testUser.email);
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid credentials or IP not whitelisted');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent@example.com',
          password: 'StrongPass123!'
        })
        .expect(401);

      expect(response.body.status).toBe('error');
    });

    it('should require username and password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid payload');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Logged out successfully');
    });
  });

  describe('GET /api/auth/me', () => {
    let testUser: any;
    let sessionCookie: string;

    beforeEach(async () => {
      // Create a test user
      testUser = await storage.createUser({
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
        isActive: true
      });

      // Login to get session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser@example.com',
          password: 'StrongPass123!'
        });

      sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
    });

    it('should return user data when authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('id', testUser.id);
      expect(response.body.data).toHaveProperty('email', testUser.email);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Not authenticated');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await storage.createUser({
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
        isActive: true
      });
    });

    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'testuser@example.com' })
        .expect(200);

      expect(response.body.message).toBe('Password reset email sent');
    });

    it('should not reveal if email exists or not', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBe('Password reset email sent');
    });

    it('should require email field', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Email is required');
    });
  });
}); 