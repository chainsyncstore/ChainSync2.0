import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

// Ensure required env for routes
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/chainsync_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'test-paystack-key';
process.env.FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'test-flw-key';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// In-memory fakes for storage and tokens
const users: any[] = [];
const stores: any[] = [];
const emailTokens = new Map<string, { userId: string }>();

// Mock DB: avoid real Postgres and always report healthy
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([])
  },
  checkDatabaseHealth: vi.fn().mockResolvedValue(true)
}));

// Mock storage to avoid DB
vi.mock('../../server/storage', () => ({
  storage: {
    async getUserByEmail(email: string) {
      return users.find(u => u.email === email);
    },
    async getIncompleteUserByEmail(email: string) {
      return users.find(u => u.email === email && u.signupCompleted === false);
    },
    async updateUserSignupAttempts(id: string) {
      const u = users.find(u => u.id === id);
      if (u) u.signupAttempts = (u.signupAttempts || 0) + 1;
    },
    async createUser(data: any) {
      const user = {
        id: `user_${Date.now()}`,
        username: data.email,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        companyName: data.companyName,
        role: 'admin',
        tier: data.tier,
        location: data.location,
        isActive: false,
        emailVerified: false,
        signupCompleted: false,
        signupAttempts: 1
      };
      users.push(user);
      return user;
    },
    async createStore(data: any) {
      const store = { id: `store_${Date.now()}`, ...data, isActive: true };
      stores.push(store);
      return store;
    },
    async markEmailVerified(userId: string) {
      const u = users.find(u => u.id === userId);
      if (u) {
        u.emailVerified = true;
        u.isActive = true;
      }
    },
    async markSignupCompleted(userId: string) {
      const u = users.find(u => u.id === userId);
      if (u) u.signupCompleted = true;
    },
    async authenticateUser(username: string, password: string) {
      return users.find(u => u.username === username) || null;
    },
    async getAllStores() { return stores; },
  }
}));

// Mock AuthService for email token creation/verification
vi.mock('../../server/auth', () => ({
  AuthService: class {
    static validatePassword(pw: string) {
      return { isValid: typeof pw === 'string' && pw.length >= 8, errors: [] };
    }
    static async createEmailVerificationToken(userId: string) {
      const token = `token_${Math.random().toString(36).slice(2)}`;
      emailTokens.set(token, { userId });
      return { token, userId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), isUsed: false } as any;
    }
    static async verifyEmailToken(token: string) {
      const rec = emailTokens.get(token);
      if (!rec) return { success: false, message: 'Invalid or expired verification token' };
      emailTokens.delete(token);
      return { success: true, userId: rec.userId, message: 'Email verified successfully' };
    }
    static sanitizeUserForSession(user: any) { const { password, ...rest } = user; return rest; }
  }
}));

// Stub email sending using vi.hoisted to avoid hoisting issues
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async () => true)
}));
vi.mock('../../server/email', () => ({
  sendEmail: sendEmailMock,
  generatePasswordResetEmail: vi.fn(() => ({})),
  generatePasswordResetSuccessEmail: vi.fn(() => ({}))
}));

// Stub subscription service used in payment verify
vi.mock('../../server/subscription/service', () => ({
  SubscriptionService: class {
    async createSubscription() { return { id: 'sub_test' }; }
    async recordPayment() { return true; }
  }
}));

// Spy on PaymentService verification to force success
import { PaymentService } from '../../server/payment/service';

import { registerRoutes } from '../../server/routes';

describe('Production-like auth/payment flows (CSRF, email verification, payment)', () => {
  let app: express.Application;
  let agent: request.SuperAgentTest;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    // Provide a session middleware before routes; registerRoutes also configures one, duplications are fine for tests
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    await registerRoutes(app);
    agent = request.agent(app);

    vi.spyOn(PaymentService.prototype, 'verifyFlutterwavePayment').mockResolvedValue(true as any);
    vi.spyOn(PaymentService.prototype, 'verifyPaystackPayment').mockResolvedValue(true as any);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('CSRF → signup (201) → verification email stubbed → verify → login allowed', async () => {
    // 1) Fetch CSRF token (sets cookie)
    const csrfRes = await agent.get('/api/auth/csrf-token').expect(200);
    const csrfToken = csrfRes.body.csrfToken;
    expect(csrfToken).toBeTruthy();

    // 2) Signup
    const email = `user_${Date.now()}@example.com`;
    const signupRes = await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', csrfToken)
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email,
        phone: '+12345678901',
        companyName: 'Test Co',
        password: 'SecurePass123!',
        tier: 'basic',
        location: 'international'
      })
      .expect(201);

    expect(signupRes.body.user).toBeTruthy();
    const userId = signupRes.body.user.id;
    expect(sendEmailMock).toHaveBeenCalled();

    // 3) Get the token created by mocked AuthService
    // Extract the last token we generated
    const lastCallArgs = sendEmailMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toBeTruthy();

    // Since we control the token map, pull any token value
    const tokenEntry = Array.from(emailTokens.keys())[0];
    expect(tokenEntry).toBeTruthy();

    // 4) Verify email
    const verifyRes = await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: tokenEntry })
      .expect(200);
    expect(verifyRes.body).toMatchObject({ success: true });

    // 5) Login allowed after verification
    const loginRes = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: email, password: 'SecurePass123!' })
      .expect(200);
    expect(loginRes.body.status).toBe('success');
  }, 30000);

  it('Payment path: signup → payment initialize → verify → signupCompleted true; login still requires email verification', async () => {
    // 1) CSRF
    const csrfRes = await agent.get('/api/auth/csrf-token').expect(200);
    const csrfToken = csrfRes.body.csrfToken;

    // 2) Signup (no verification yet)
    const email = `pay_${Date.now()}@example.com`;
    const signupRes = await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', csrfToken)
      .send({
        firstName: 'Pay',
        lastName: 'User',
        email,
        phone: '+12345678901',
        companyName: 'Pay Co',
        password: 'SecurePass123!',
        tier: 'basic',
        location: 'international'
      })
      .expect(201);

    const userId = signupRes.body.user.id;

    // 3) Initialize payment for USD/Flutterwave
    const initRes = await agent
      .post('/api/payment/initialize')
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        currency: 'USD',
        provider: 'flutterwave',
        tier: 'basic',
        userId,
        metadata: { note: 'test' }
      })
      .expect(200);

    expect(initRes.body.reference || initRes.body.data?.reference).toBeTruthy();
    const reference = initRes.body.reference || initRes.body.data?.reference;

    // 4) Verify payment (mocked success)
    await agent
      .post('/api/payment/verify')
      .set('X-CSRF-Token', csrfToken)
      .send({ reference, status: 'successful', userId, tier: 'basic', location: 'international' })
      .expect(200);

    // Ensure signupCompleted is true server-side
    const created = users.find(u => u.id === userId);
    expect(created?.signupCompleted).toBe(true);

    // 5) Login should still be blocked due to email not verified
    const blockedLogin = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: email, password: 'SecurePass123!' })
      .expect(400);
    expect(blockedLogin.body.message || blockedLogin.body.error).toMatch(/verify your email/i);
  }, 30000);
});


