import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  organizations,
  subscriptions as prdSubscriptions,
  users as prdUsers,
} from '@shared/schema';
import { db } from '@server/db';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

const mockPaymentService = {
  initializePaystackPayment: vi.fn(),
  initializeFlutterwavePayment: vi.fn(),
  verifyPaystackPayment: vi.fn(),
  verifyFlutterwavePayment: vi.fn(),
  generateReference: vi.fn().mockImplementation((provider: 'paystack' | 'flutterwave') => `${provider.toUpperCase()}_REF_${Date.now()}`),
  getAutopayDetails: vi.fn(),
  chargePaystackAuthorization: vi.fn(),
  chargeFlutterwaveToken: vi.fn(),
};

vi.mock('@server/payment/service', () => ({
  PaymentService: vi.fn().mockImplementation(() => mockPaymentService),
}));

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

async function clearDatabase() {
  await db.delete(prdSubscriptions);
  await db.delete(prdUsers);
  await db.delete(organizations);
}

const useRealDb = process.env.LOYALTY_REALDB === '1';

describe('Billing Autopay Integration Tests', () => {
  let app: Express;
  let agent: ReturnType<typeof supertest.agent>;
  let subscriptionId: string;
  const password = 'StrongPass123!';

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'autopay-test-secret';
    process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'ps_test_secret';
    process.env.FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'flw_test_secret';
    process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

    mockPaymentService.initializePaystackPayment.mockReset();
    mockPaymentService.initializeFlutterwavePayment.mockReset();
    mockPaymentService.verifyPaystackPayment.mockReset();
    mockPaymentService.verifyFlutterwavePayment.mockReset();
    mockPaymentService.generateReference.mockReset();
    mockPaymentService.getAutopayDetails.mockReset();
    mockPaymentService.chargePaystackAuthorization.mockReset();
    mockPaymentService.chargeFlutterwaveToken.mockReset();

    if (!useRealDb) {
      await storage.clear();
      await clearDatabase();
    }

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    agent = supertest.agent(app);

    const orgId = makeId('org');
    const now = new Date();

    await db.insert(organizations).values({
      id: orgId,
      name: 'Autopay Test Org',
      currency: 'NGN',
      isActive: true,
      createdAt: now,
    } as any);

    const user = await storage.createUser({
      id: makeId('user'),
      username: 'autopay.admin@example.com',
      password,
      email: 'autopay.admin@example.com',
      firstName: 'Auto',
      lastName: 'Pay',
      phone: '+1234567890',
      companyName: 'Autopay Test Co',
      role: 'admin',
      orgId,
      isActive: true,
      isAdmin: true,
      emailVerified: true,
    });

    await storage.updateUser(user.id, {
      orgId,
      isAdmin: true,
      signupCompleted: true,
      signupCompletedAt: now,
    });

    await db.select().from(prdUsers).where(eq(prdUsers.id, user.id)).limit(1);

    subscriptionId = makeId('sub');
    await db.insert(prdSubscriptions).values({
      id: subscriptionId,
      orgId,
      userId: user.id,
      provider: 'PAYSTACK',
      planCode: 'basic',
      status: 'ACTIVE',
      autopayEnabled: false,
      autopayProvider: null,
      autopayReference: null,
      autopayConfiguredAt: null,
      autopayLastStatus: null,
      createdAt: now,
      updatedAt: now,
    } as any);

    await agent
      .post('/api/auth/login')
      .send({ username: user.username, password })
      .expect(200);

    await agent.get('/api/auth/me').expect(200);
  });

  afterEach(async () => {
    if (!useRealDb) {
      await storage.clear();
      await clearDatabase();
    }
    vi.clearAllMocks();
  });

  it('returns the current autopay status for the organization admin', async () => {
    const response = await agent
      .get('/api/billing/autopay')
      .expect(200);

    expect(response.body).toEqual({
      autopay: {
        enabled: false,
        provider: null,
        status: null,
        configuredAt: null,
        details: null,
      },
    });
    expect(mockPaymentService.getAutopayDetails).not.toHaveBeenCalled();
  });

  it('configures autopay when confirmation succeeds', async () => {
    mockPaymentService.getAutopayDetails.mockResolvedValue({
      autopayReference: 'AUTH_CODE_123',
      email: 'autopay.admin@example.com',
      last4: '4242',
      expMonth: '09',
      expYear: '30',
      cardType: 'visa',
      bank: 'Test Bank',
    });

    const response = await agent
      .post('/api/billing/autopay/confirm')
      .send({ provider: 'paystack', reference: 'PAYSTACK_REF_987' })
      .expect(200);

    expect(mockPaymentService.getAutopayDetails).toHaveBeenCalledWith('PAYSTACK', 'PAYSTACK_REF_987');
    expect(response.body.autopay).toMatchObject({
      enabled: true,
      provider: 'PAYSTACK',
      status: 'configured',
    });
    expect(response.body.autopay.details).toMatchObject({
      email: 'autopay.admin@example.com',
      last4: '4242',
      cardType: 'visa',
    });

    const [updated] = await db
      .select()
      .from(prdSubscriptions)
      .where(eq(prdSubscriptions.id, subscriptionId));

    expect(updated?.autopayEnabled).toBe(true);
    expect(updated?.autopayProvider).toBe('PAYSTACK');
    expect(updated?.autopayReference).toBe('AUTH_CODE_123');
    expect(updated?.autopayLastStatus).toBe('configured');
  });

  it('disables autopay and clears stored mandate details', async () => {
    mockPaymentService.getAutopayDetails.mockResolvedValue({
      autopayReference: 'AUTH_CODE_DISABLE',
      email: 'autopay.admin@example.com',
    });

    await agent
      .post('/api/billing/autopay/confirm')
      .send({ provider: 'paystack', reference: 'PAYSTACK_REF_DISABLE' })
      .expect(200);

    const disableResponse = await agent
      .delete('/api/billing/autopay')
      .expect(200);

    expect(disableResponse.body.autopay).toMatchObject({
      enabled: false,
      provider: null,
      status: 'disabled',
      details: null,
    });

    const [afterDisable] = await db
      .select()
      .from(prdSubscriptions)
      .where(eq(prdSubscriptions.id, subscriptionId));

    expect(afterDisable?.autopayEnabled).toBe(false);
    expect(afterDisable?.autopayProvider).toBeNull();
    expect(afterDisable?.autopayReference).toBeNull();
    expect(afterDisable?.autopayLastStatus).toBe('disabled');
  });
});
