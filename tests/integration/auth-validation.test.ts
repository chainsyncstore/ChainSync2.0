import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express, { type Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PendingSignup } from '@server/api/pending-signup';

import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';

async function seedAdminUser() {
  await storage.createUser({
    username: `seed-admin-${Date.now()}@example.com`,
    email: `seed-admin-${Date.now()}@example.com`,
    password: 'SeedPass123!',
    firstName: 'Seed',
    lastName: 'Admin',
    phone: '+10000000000',
    companyName: 'Seed Company',
    role: 'admin',
    location: 'international',
    isActive: true,
    emailVerified: true,
  } as any);
}

describe('Auth Validation Integration Tests', () => {
  let app: Express;
  let server: any;
  const previousPendingFlag = process.env.TEST_PENDING_SIGNUP;

  beforeAll(async () => {
    process.env.TEST_PENDING_SIGNUP = 'true';
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, cookie: { secure: false } }));
    await registerRoutes(app);
    server = app.listen(0);
  });

  afterAll(async () => {
    process.env.TEST_PENDING_SIGNUP = previousPendingFlag;
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    await storage.clear();
  });

  describe('POST /api/auth/signup', () => {
    const baseUrl = '/api/auth/signup';

    describe('Valid Signup Payloads', () => {
      it('should accept a valid signup payload', async () => {
        await seedAdminUser();
        const validPayload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(202);

        expect(response.body.pending).toBe(true);
        expect(typeof response.body.pendingToken).toBe('string');
      });

      it('should accept signup with pro tier', async () => {
        const validPayload = {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.pro@company.com',
          phone: '+9876543210',
          companyName: 'Tech Solutions',
          password: 'StrongPwd456!',
          tier: 'pro',
          location: 'international'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(202);

        expect(response.body.pending).toBe(true);
      });

      it('should accept signup with enterprise tier', async () => {
        await seedAdminUser();
        const validPayload = {
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob.johnson@enterprise.com',
          phone: '+1122334455',
          companyName: 'Enterprise Inc',
          password: 'EnterprisePass789!',
          tier: 'enterprise',
          location: 'international'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload)
          .expect(202);

        expect(response.body.pending).toBe(true);
      });

      it('allows resending the OTP up to three times before rate limiting', async () => {
        await seedAdminUser();
        const payload = {
          firstName: 'Resend',
          lastName: 'Tester',
          email: `resend.${Date.now()}@example.com`,
          phone: '+19876543210',
          companyName: 'Resend Co',
          password: 'StrongPass123!',
          tier: 'basic',
          location: 'international'
        };

        const signupResponse = await request(server).post(baseUrl).send(payload).expect(202);
        const rawPendingCookies = signupResponse.headers['set-cookie'];
        const cookieHeader = Array.isArray(rawPendingCookies)
          ? rawPendingCookies
          : rawPendingCookies
            ? [rawPendingCookies]
            : [];

        const resendPath = '/api/auth/resend-otp';

        await request(server).post(resendPath).set('Cookie', cookieHeader).send({ email: payload.email }).expect(200);
        await request(server).post(resendPath).set('Cookie', cookieHeader).send({ email: payload.email }).expect(200);
        await request(server).post(resendPath).set('Cookie', cookieHeader).send({ email: payload.email }).expect(200);

        const limitResponse = await request(server)
          .post(resendPath)
          .set('Cookie', cookieHeader)
          .send({ email: payload.email })
          .expect(429);
        expect(limitResponse.body.message).toMatch(/maximum number of resend attempts/i);
      });

      it('completes OTP verification and returns dashboard redirect metadata', async () => {
        await seedAdminUser();
        const payload = {
          firstName: 'Otp',
          lastName: 'Verifier',
          email: `verify.${Date.now()}@example.com`,
          phone: '+1234509876',
          companyName: 'OTP Corp',
          password: 'StrongPass123!',
          tier: 'basic',
          location: 'international'
        };

        const signupResponse = await request(server).post(baseUrl).send(payload).expect(202);
        const rawCookies = signupResponse.headers['set-cookie'];
        const pendingCookie = Array.isArray(rawCookies)
          ? rawCookies.find((cookie) => cookie.startsWith('pending_signup=')) ?? ''
          : typeof rawCookies === 'string' && rawCookies.startsWith('pending_signup=')
            ? rawCookies
            : '';

        const pending = await PendingSignup.getByEmailWithTokenAsync(payload.email);
        expect(pending).toBeTruthy();

        const otpCode = '123456';
        const otpSalt = crypto.randomBytes(16).toString('hex');
        const otpHash = crypto.createHmac('sha256', otpSalt).update(otpCode).digest('hex');
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await PendingSignup.updateToken(pending!.token, {
          ...pending!.data,
          otpSalt,
          otpHash,
          otpAttempts: 0,
          otpExpiresAt: otpExpiresAt.toISOString(),
          lastOtpSentAt: new Date().toISOString(),
        });

        const verifyResponse = await request(server)
          .post('/api/auth/verify-otp')
          .set('Cookie', pendingCookie)
          .send({ email: payload.email, otp: otpCode })
          .expect(200);

        expect(verifyResponse.body.redirect).toBe('/admin/dashboard');
        expect(new Date(verifyResponse.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now());

        const user = await storage.getUserByEmail(payload.email);
        expect(user?.signupCompleted).toBe(true);
        expect(user?.emailVerified).toBe(true);
        expect(user?.isActive).toBe(true);
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
          expect(response.body.error).toContain('firstName');
        });

        it('should reject signup without email', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1234567890',
            companyName: 'Acme Corp',
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
          expect(response.body.error).toContain('phone');
        });

        it('should reject phone number shorter than 7 digits', async () => {
          const invalidPayload = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+123456',
            companyName: 'Acme Corp',
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'invalid-tier',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
            password: 'SecurePass123!',
            tier: 'basic',
            location: 'international'
          };

          const response = await request(server)
            .post(baseUrl)
            .send(invalidPayload)
            .expect(400);

          expect(response.body.error).toBeDefined();
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
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body.error).toBeDefined();
        expect(response.body.error).toContain('firstName');
      });

      it('should reject whitespace-only string values', async () => {
        const invalidPayload = {
          firstName: '   ',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
          companyName: 'Acme Corp',
          password: 'SecurePass123!',
          tier: 'basic',
          location: 'international'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body.error).toBeDefined();
        expect(response.body.error).toContain('firstName');
      });
    });
  });

  describe('POST /api/auth/login', () => {
    const baseUrl = '/api/auth/login';

    describe('Valid Login Payloads', () => {
      it('should accept a valid login payload', async () => {
        await storage.createUser({
          email: 'test@example.com',
          password: 'TestPass123!',
          emailVerified: true,
        } as any);
        const validPayload = {
          email: 'test@example.com',
          password: 'TestPass123!'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(validPayload);

        expect(response.status).not.toBe(400);
      });
    });

    describe('Invalid Login Payloads', () => {
      it('should reject login without email', async () => {
        const invalidPayload = {
          password: 'TestPass123!'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body.message).toBe('Invalid email or password');
      });

      it('should reject login without password', async () => {
        const invalidPayload = {
          email: 'test@example.com'
        };

        const response = await request(server)
          .post(baseUrl)
          .send(invalidPayload)
          .expect(400);

        expect(response.body.message).toBe('Invalid email or password');
      });
    });
  });
});
