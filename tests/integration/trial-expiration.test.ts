import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import express, { type Express } from 'express';
import session from 'express-session';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  organizations,
  subscriptions as prdSubscriptions,
  subscriptionPayments,
  users as prdUsers,
} from '@shared/schema';
import { db } from '@server/db';
import { runTrialExpirationBillingNow } from '@server/jobs/cleanup';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

const debugLogPath = path.join(process.cwd(), 'test-results', 'trial-expiration.debug.log');

async function appendDebugLog(label: string, payload: unknown) {
  try {
    const dir = path.dirname(debugLogPath);
    await mkdir(dir, { recursive: true });
    const entry =
      new Date().toISOString() +
      ' [' +
      label +
      ']\n' +
      JSON.stringify(payload, null, 2) +
      '\n\n';
    await appendFile(debugLogPath, entry, 'utf8');
  } catch (error) {
    const message = `Failed to append trial expiration debug log: ${error instanceof Error ? error.message : String(error)}\n`;
    process.stderr.write(message);
  }
}

async function clearDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE subscription_payments, subscriptions, users, organizations RESTART IDENTITY CASCADE`
  );
}

describe('Trial expiration billing job', () => {
  let app: Express;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'trial-billing-test-secret';
    process.env.PAYSTACK_SECRET_KEY = 'ps_test_secret';
    process.env.FLUTTERWAVE_SECRET_KEY = 'flw_test_secret';

    await storage.clear();
    await clearDatabase();

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: 'trial-billing-test-secret', resave: false, saveUninitialized: false, cookie: { secure: false } }));
    await registerRoutes(app);
  });

  afterEach(async () => {
    await storage.clear();
    await clearDatabase();
  });

  it('activates the subscription when autopay charge succeeds', async () => {
    const orgId = makeId('org');
    const userId = makeId('user');
    const subscriptionId = makeId('sub');
    const now = new Date();
    const trialEnded = new Date(now.getTime() - 60 * 1000);

    await db.insert(organizations).values({
      id: orgId,
      name: 'Trial Success Org',
      currency: 'NGN',
      isActive: true,
      createdAt: now,
    } as any);

    await storage.createUser({
      id: userId,
      username: 'success.admin@example.com',
      email: 'success.admin@example.com',
      password: 'StrongPass123!',
      firstName: 'Success',
      lastName: 'Admin',
      companyName: 'Success Co',
      phone: '+1234567890',
      role: 'admin',
      orgId,
      isAdmin: true,
      isActive: true,
      emailVerified: true,
    } as any);

    await db.insert(prdUsers).values({
      id: userId,
      orgId,
      email: 'success.admin@example.com',
      passwordHash: 'test-hash',
      isAdmin: true,
      emailVerified: true,
    } as any);

    await db.insert(prdSubscriptions).values({
      id: subscriptionId,
      orgId,
      userId,
      provider: 'PAYSTACK',
      planCode: 'basic',
      tier: 'basic',
      status: 'TRIAL',
      trialEndDate: trialEnded,
      trialStartDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      autopayEnabled: true,
      autopayProvider: 'PAYSTACK',
      autopayReference: 'AUTH_SUCCESS_123',
      autopayLastStatus: 'configured',
      autopayConfiguredAt: now,
      upfrontFeePaid: '1000.00',
      upfrontFeeCurrency: 'NGN',
      monthlyAmount: '30000.00',
      monthlyCurrency: 'NGN',
      createdAt: now,
      updatedAt: now,
    } as any);

    const dueBefore = await db
      .select({ subscription: prdSubscriptions })
      .from(prdSubscriptions)
      .where(
        and(
          eq(prdSubscriptions.status as any, 'TRIAL' as any),
          isNotNull(prdSubscriptions.trialEndDate),
          lte(prdSubscriptions.trialEndDate as any, new Date())
        )
      );

    const orgRow = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const userRow = await db
      .select()
      .from(prdUsers)
      .where(eq(prdUsers.id, userId));

    await appendDebugLog('pre-run success due subscriptions', dueBefore);
    await appendDebugLog('pre-run success context', { orgRow, userRow });

    const paymentService = {
      generateReference: vi.fn().mockReturnValue('PAYSTACK_GEN_REF'),
      chargePaystackAuthorization: vi.fn().mockResolvedValue({
        success: true,
        reference: 'PAYSTACK_CHARGE_REF',
        raw: { status: 'success' },
      }),
      chargeFlutterwaveToken: vi.fn(),
    };

    await runTrialExpirationBillingNow(paymentService as any);

    const [updatedSub] = await db
      .select()
      .from(prdSubscriptions)
      .where(eq(prdSubscriptions.id, subscriptionId));

    const [updatedOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.orgId, orgId as any));

    try {
      expect(updatedSub?.status).toBe('ACTIVE');
      expect(updatedSub?.autopayLastStatus).toBe('charged');
      expect(updatedSub?.nextBillingDate).not.toBeNull();

      expect(updatedOrg?.isActive).toBe(true);
      expect(updatedOrg?.lockedUntil).toBeNull();

      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe('completed');
      expect(payments[0].reference).toBe('PAYSTACK_CHARGE_REF');
      expect(payments[0].provider).toBe('PAYSTACK');
    } catch (error) {
      await appendDebugLog('trial-expiration success assertion failure', {
        subscription: updatedSub,
        organization: updatedOrg,
        payments,
        paymentServiceCalls: {
          generateReference: paymentService.generateReference.mock.calls,
          chargePaystackAuthorization: paymentService.chargePaystackAuthorization.mock.calls,
        },
      });
      throw error;
    }
  });

  it('handles recurring active renewal and autopay failure paths', async () => {
    const orgId = makeId('org');
    const userId = makeId('user');
    const subscriptionId = makeId('sub');
    const now = new Date();
    const trialEnded = new Date(now.getTime() - 60 * 1000);

    await db.insert(organizations).values({
      id: orgId,
      name: 'Trial Failure Org',
      currency: 'NGN',
      isActive: true,
      createdAt: now,
    } as any);

    await storage.createUser({
      id: userId,
      username: 'failure.admin@example.com',
      email: 'failure.admin@example.com',
      password: 'StrongPass123!',
      firstName: 'Failure',
      lastName: 'Admin',
      companyName: 'Failure Co',
      phone: '+10987654321',
      role: 'admin',
      orgId,
      isAdmin: true,
      isActive: true,
      emailVerified: true,
    } as any);

    await db.insert(prdUsers).values({
      id: userId,
      orgId,
      email: 'failure.admin@example.com',
      passwordHash: 'test-hash',
      isAdmin: true,
      emailVerified: true,
    } as any);

    await db.insert(prdSubscriptions).values({
      id: subscriptionId,
      orgId,
      userId,
      provider: 'PAYSTACK',
      planCode: 'basic',
      tier: 'basic',
      status: 'TRIAL',
      trialEndDate: trialEnded,
      trialStartDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      autopayEnabled: true,
      autopayProvider: 'PAYSTACK',
      autopayReference: 'AUTH_FAIL_123',
      autopayLastStatus: 'configured',
      autopayConfiguredAt: now,
      upfrontFeePaid: '1000.00',
      upfrontFeeCurrency: 'NGN',
      monthlyAmount: '30000.00',
      monthlyCurrency: 'NGN',
      createdAt: now,
      updatedAt: now,
    } as any);

    const dueBefore = await db
      .select({ subscription: prdSubscriptions })
      .from(prdSubscriptions)
      .where(
        and(
          eq(prdSubscriptions.status as any, 'TRIAL' as any),
          isNotNull(prdSubscriptions.trialEndDate),
          lte(prdSubscriptions.trialEndDate as any, new Date())
        )
      );

    const orgRow = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const userRow = await db
      .select()
      .from(prdUsers)
      .where(eq(prdUsers.id, userId));

    await appendDebugLog('pre-run failure due subscriptions', dueBefore);
    await appendDebugLog('pre-run failure context', { orgRow, userRow });

    const paymentService = {
      generateReference: vi.fn().mockReturnValue('PAYSTACK_FAIL_GEN_REF'),
      chargePaystackAuthorization: vi.fn().mockResolvedValue({
        success: false,
        reference: 'PAYSTACK_FAIL_REF',
        message: 'Insufficient funds',
        raw: { status: 'failed' },
      }),
      chargeFlutterwaveToken: vi.fn(),
    };

    await runTrialExpirationBillingNow(paymentService as any);

    const [updatedSub] = await db
      .select()
      .from(prdSubscriptions)
      .where(eq(prdSubscriptions.id, subscriptionId));

    const [updatedOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.orgId, orgId as any));

    try {
      expect(updatedSub?.status).toBe('PAST_DUE');
      expect(updatedSub?.autopayLastStatus).toBe('failed');

      expect(updatedOrg?.isActive).toBe(false);
      expect(updatedOrg?.lockedUntil).not.toBeNull();

      const payment = payments.find((row) => row.reference === 'PAYSTACK_FAIL_REF');
      expect(payment).toBeDefined();
      expect(payment?.status).toBe('failed');
      expect(payment?.provider).toBe('PAYSTACK');
    } catch (error) {
      await appendDebugLog('trial-expiration failure assertion failure', {
        subscription: updatedSub,
        organization: updatedOrg,
        payments,
        paymentServiceCalls: {
          generateReference: paymentService.generateReference.mock.calls,
          chargePaystackAuthorization: paymentService.chargePaystackAuthorization.mock.calls,
        },
      });
      throw error;
    }
  });

  it('renews active subscriptions when nextBillingDate reached', async () => {
    const orgId = makeId('org');
    const userId = makeId('user');
    const subscriptionId = makeId('sub');
    const now = new Date();
    const nextBillingDue = new Date(now.getTime() - 60 * 1000);

    await db.insert(organizations).values({
      id: orgId,
      name: 'Recurring Org',
      currency: 'NGN',
      isActive: true,
      createdAt: now,
    } as any);

    await storage.createUser({
      id: userId,
      username: 'recurring.admin@example.com',
      email: 'recurring.admin@example.com',
      password: 'StrongPass123!',
      firstName: 'Recurring',
      lastName: 'Admin',
      companyName: 'Recurring Co',
      phone: '+1010101010',
      role: 'admin',
      orgId,
      isAdmin: true,
      isActive: true,
      emailVerified: true,
    } as any);

    await db.insert(prdUsers).values({
      id: userId,
      orgId,
      email: 'recurring.admin@example.com',
      passwordHash: 'test-hash',
      isAdmin: true,
      emailVerified: true,
    } as any);

    await db.insert(prdSubscriptions).values({
      id: subscriptionId,
      orgId,
      userId,
      provider: 'PAYSTACK',
      planCode: 'basic',
      tier: 'basic',
      status: 'ACTIVE',
      trialStartDate: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
      trialEndDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      nextBillingDate: nextBillingDue,
      autopayEnabled: true,
      autopayProvider: 'PAYSTACK',
      autopayReference: 'AUTH_ACTIVE_123',
      autopayLastStatus: 'charged',
      autopayConfiguredAt: now,
      upfrontFeePaid: '1000.00',
      upfrontFeeCurrency: 'NGN',
      monthlyAmount: '30000.00',
      monthlyCurrency: 'NGN',
      createdAt: now,
      updatedAt: now,
    } as any);

    const paymentService = {
      generateReference: vi.fn().mockReturnValue('PAYSTACK_ACTIVE_GEN_REF'),
      chargePaystackAuthorization: vi.fn().mockResolvedValue({
        success: true,
        reference: 'PAYSTACK_ACTIVE_CHARGE_REF',
        raw: { status: 'success' },
      }),
      chargeFlutterwaveToken: vi.fn(),
    };

    await runTrialExpirationBillingNow(paymentService as any);

    const [updatedSub] = await db
      .select()
      .from(prdSubscriptions)
      .where(eq(prdSubscriptions.id, subscriptionId));

    const [updatedOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.orgId, orgId as any));

    try {
      expect(updatedSub?.status).toBe('ACTIVE');
      expect(updatedSub?.autopayLastStatus).toBe('charged');
      expect(updatedSub?.nextBillingDate).not.toBeNull();
      expect(updatedSub?.nextBillingDate?.getTime()).toBeGreaterThan(nextBillingDue.getTime());

      expect(updatedOrg?.isActive).toBe(true);
      expect(updatedOrg?.lockedUntil).toBeNull();

      const payment = payments.find((row) => row.reference === 'PAYSTACK_ACTIVE_CHARGE_REF');
      expect(payment).toBeDefined();
      expect(payment?.status).toBe('completed');
      expect(payment?.provider).toBe('PAYSTACK');
    } catch (error) {
      await appendDebugLog('recurring renewal assertion failure', {
        subscription: updatedSub,
        organization: updatedOrg,
        payments,
        paymentServiceCalls: {
          generateReference: paymentService.generateReference.mock.calls,
          chargePaystackAuthorization: paymentService.chargePaystackAuthorization.mock.calls,
        },
      });
      throw error;
    }
  });
});
