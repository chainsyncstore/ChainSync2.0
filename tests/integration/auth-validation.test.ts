import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/index';
import { db } from '../../server/db';

describe('Auth Validation Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    // Start the server for testing
    server = app.listen(0); // Use random port
  });

  afterAll(async () => {
    // Clean up
    if (server) {
      server.close();
    }
  });

  describe('POST /api/auth/signup', () => {
    const baseUrl = '/api/auth/signup';

    describe('Valid Signup Payloads', () => {
      it('should accept a valid signup payload', async () => {
        const validPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(201);

        expect(response.body).toHaveProperty('message', 'Account created successfully');
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('store');
      });

      it('should accept signup with pro tier', async () => {
        const validPayload = {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.pro@company.com',
          phone: '+9876543210',
          companyName: 'Tech Solutions',
          password: 'StrongPwd456',
          tier: 'pro',
          location: 'San Francisco'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(201);

        expect(response.body.user.tier).toBe('pro');
      });

      it('should accept signup with enterprise tier', async () => {
        const validPayload = {
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob.johnson@enterprise.com',
          phone: '+1122334455',
          companyName: 'Enterprise Inc',
          password: 'EnterprisePass789',
          tier: 'enterprise',
          location: 'Chicago'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(201);

        expect(response.body.user.tier).toBe('enterprise');
      });
    });

    describe('Invalid Signup Payloads', () => {
      describe('Missing Required Fields', () => {
        it('should reject signup without firstName', async () => {
          const invalidPayload = {
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('firstName');
        });

        it('should reject signup without email', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('email');
        });

        it('should reject signup without password', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('password');
        });
      });

      describe('Email Validation', () => {
        it('should reject invalid email format', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'invalid-email',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('email');
        });

        it('should reject email longer than 254 characters', async () => {
          const longEmail = 'a'.repeat(250) + '@example.com';
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: longEmail,
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('email');
        });
      });

      describe('Password Validation', () => {
        it('should reject password shorter than 8 characters', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'Short',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('password');
        });

        it('should reject password without required complexity', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'onlylowercase',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('password');
        });
      });

      describe('Phone Validation', () => {
        it('should reject invalid phone format', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '123-456-7890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('phone');
        });

        it('should reject phone number shorter than 7 digits', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+123456',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('phone');
        });
      });

      describe('Tier Validation', () => {
        it('should reject invalid tier value', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'invalid-tier',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('tier');
        });
      });

      describe('Text Field Length Validation', () => {
        it('should reject firstName longer than 100 characters', async () => {
          const longName = 'A'.repeat(101);
          const invalidPayload = {
            firstName: longName,
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('firstName');
        });

        it('should reject companyName longer than 100 characters', async () => {
          const longCompany = 'A'.repeat(101);
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            companyName: longCompany,
            password: 'SecurePass123',
            tier: 'basic',
            location: 'New York'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toContain('companyName');
        });
      });
    });

    describe('Edge Cases', () => {
      it('should reject empty string values', async () => {
        const invalidPayload = {
          firstName: '',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('firstName');
      });

      it('should reject whitespace-only string values', async () => {
        const invalidPayload = {
          firstName: '   ',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('firstName');
      });

      it('should reject null values', async () => {
        const invalidPayload = {
          firstName: null,
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123',
          tier: 'basic',
          location: 'New York'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('firstName');
      });
    });
  });

  describe('POST /api/auth/login', () => {
    const baseUrl = '/api/auth/login';

    describe('Valid Login Payloads', () => {
      it('should accept a valid login payload', async () => {
        const validPayload = {
          username: 'test@example.com',
          password: 'TestPass123'
        };

        // Note: This will likely fail due to user not existing, but we're testing validation
        // The important thing is that it doesn't fail due to validation
        const response = await request(server)
          .post(baseUrl)
          .send(validPayload);

        // Should not be a 400 validation error
        expect(response.status).not.toBe(400);
      });
    });

    describe('Invalid Login Payloads', () => {
      it('should reject login without username', async () => {
        const invalidPayload = {
          password: 'TestPass123'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('username');
      });

      it('should reject login without password', async () => {
        const invalidPayload = {
          username: 'test@example.com'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('password');
      });
    });
  });
});
