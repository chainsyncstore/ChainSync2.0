import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { organizations, subscriptions, users } from '@shared/prd-schema';

import { db } from '../db';
import { logger } from '../lib/logger';
import { getPlan } from '../lib/plans';
import { requireAuth } from '../middleware/authz';
import { PaymentService, AutopayDetails } from '../payment/service';
import { storage } from '../storage';
import { SubscriptionService } from '../subscription/service';

const SubscribeSchema = z.object({
  orgId: z.string().uuid(),
  planCode: z.string(),
  email: z.string().email(),
});

const AutopayConfirmSchema = z.object({
  provider: z.string().min(2),
  reference: z.string().min(1),
});

const subscriptionService = new SubscriptionService();

function toIsoString(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function summarizeAutopayDetails(details: AutopayDetails | null | undefined) {
  if (!details) return null;
  return {
    email: details.email ?? null,
    last4: details.last4 ?? null,
    expMonth: details.expMonth ?? null,
    expYear: details.expYear ?? null,
    cardType: details.cardType ?? null,
    bank: details.bank ?? null,
  };
}

export async function registerBillingRoutes(app: Express) {
  app.post('/billing/subscribe', async (req: Request, res: Response) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { orgId, planCode, email } = parsed.data;
    const plan = getPlan(planCode);
    if (!plan) return res.status(400).json({ error: 'Invalid plan code' });

    // Verify org exists
    const orgRows = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const org = orgRows[0];
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const service = new PaymentService();
    // Plan does not carry provider details in typings; derive via env mapping
    const provider = (process.env.DEFAULT_PAYMENT_PROVIDER || 'PAYSTACK') as 'PAYSTACK' | 'FLUTTERWAVE';
    const reference = service.generateReference(provider === 'PAYSTACK' ? 'paystack' : 'flutterwave');
    const callbackUrl = `${process.env.BASE_URL || process.env.APP_URL}/payment/callback?orgId=${orgId}&planCode=${plan.code}`;

    const envKey = `PROVIDER_PLAN_ID_${plan.code.toUpperCase()}`;
    const providerPlanId = process.env[envKey];
    if (!providerPlanId) {
      return res.status(500).json({ error: `Missing provider plan id env: ${envKey}` });
    }

    const resp = provider === 'PAYSTACK'
      ? await service.initializePaystackPayment({
          email,
          amount: Number(process.env[`PLAN_AMOUNT_${plan.code.toUpperCase()}`] || '0'),
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: { orgId, planCode: plan.code },
          providerPlanId,
        })
      : await service.initializeFlutterwavePayment({
          email,
          amount: Number(process.env[`PLAN_AMOUNT_${plan.code.toUpperCase()}`] || '0'),
          currency: 'USD',
          reference,
          callback_url: callbackUrl,
          metadata: { orgId, planCode: plan.code },
          providerPlanId,
        });

    res.json({
      provider,
      reference,
      redirectUrl: resp.data.authorization_url || resp.data.link,
    });
  });

  app.get('/api/billing/autopay', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    let [user] = await db.select().from(users).where(eq(users.id, currentUserId));
    if (!user && process.env.NODE_ENV === 'test') {
      const fallback = await storage.getUser(currentUserId);
      if (fallback) {
        user = {
          id: fallback.id,
          orgId: fallback.orgId ?? null,
          isAdmin: Boolean((fallback as any).isAdmin),
          emailVerified: Boolean((fallback as any).emailVerified),
        } as typeof users.$inferSelect;
      }
    }
    if (process.env.NODE_ENV === 'test') {
      logger.debug('autopay-get user lookup', {
        currentUserId,
        found: Boolean(user),
        userOrgId: user?.orgId,
        userIsAdmin: user?.isAdmin,
      });
    }
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (!user.orgId) return res.status(400).json({ error: 'User is not associated with an organization' });

    if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId as any, user.orgId as any))
      .limit(1);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found for organization' });
    }

    let autopayDetails: AutopayDetails | null = null;
    if (subscription.autopayEnabled && subscription.autopayReference) {
      const provider = (subscription.autopayProvider || subscription.provider) as 'PAYSTACK' | 'FLW';
      try {
        const service = new PaymentService();
        autopayDetails = await service.getAutopayDetails(provider, subscription.autopayReference);
      } catch (error) {
        logger.warn('Failed to fetch autopay details', {
          provider,
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return res.json({
      autopay: {
        enabled: !!subscription.autopayEnabled,
        provider: subscription.autopayProvider,
        status: subscription.autopayLastStatus,
        configuredAt: toIsoString(subscription.autopayConfiguredAt as any),
        details: summarizeAutopayDetails(autopayDetails),
      },
    });
  });

  app.post('/api/billing/autopay/confirm', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    const parsed = AutopayConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const providerInput = parsed.data.provider.trim();
    const reference = parsed.data.reference.trim();
    const normalized = providerInput.toUpperCase();
    const provider: 'PAYSTACK' | 'FLW' | null = normalized.startsWith('PAYSTACK')
      ? 'PAYSTACK'
      : normalized.startsWith('FLUTTERWAVE') || normalized === 'FLW'
      ? 'FLW'
      : null;

    if (!provider) {
      return res.status(400).json({ error: 'Unsupported autopay provider' });
    }

    let [user] = await db.select().from(users).where(eq(users.id, currentUserId));
    if (!user && process.env.NODE_ENV === 'test') {
      const fallback = await storage.getUser(currentUserId);
      if (fallback) {
        user = {
          id: fallback.id,
          orgId: fallback.orgId ?? null,
          isAdmin: Boolean((fallback as any).isAdmin),
          emailVerified: Boolean((fallback as any).emailVerified),
        } as typeof users.$inferSelect;
      }
    }
    if (process.env.NODE_ENV === 'test') {
      logger.debug('autopay-confirm user lookup', {
        currentUserId,
        found: Boolean(user),
        userOrgId: user?.orgId,
        userIsAdmin: user?.isAdmin,
      });
    }
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (!user.orgId) return res.status(400).json({ error: 'User is not associated with an organization' });
    if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId as any, user.orgId as any))
      .limit(1);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found for organization' });
    }

    const paymentService = new PaymentService();
    let autopayDetails: AutopayDetails | null = null;

    try {
      autopayDetails = await paymentService.getAutopayDetails(provider, reference);
    } catch (error) {
      logger.warn('Autopay verification failed', {
        provider,
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ error: 'Failed to verify payment method' });
    }

    if (!autopayDetails || !autopayDetails.autopayReference) {
      return res.status(400).json({ error: 'Unable to resolve autopay authorization' });
    }

    const updated = await subscriptionService.configureAutopay(
      subscription.id as string,
      provider,
      autopayDetails.autopayReference,
    );

    return res.json({
      autopay: {
        enabled: true,
        provider,
        status: updated.autopayLastStatus,
        configuredAt: toIsoString(updated.autopayConfiguredAt as any),
        details: summarizeAutopayDetails(autopayDetails),
      },
    });
  });

  app.delete('/api/billing/autopay', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    let [user] = await db.select().from(users).where(eq(users.id, currentUserId));
    if (!user && process.env.NODE_ENV === 'test') {
      const fallback = await storage.getUser(currentUserId);
      if (fallback) {
        user = {
          id: fallback.id,
          orgId: fallback.orgId ?? null,
          isAdmin: Boolean((fallback as any).isAdmin),
          emailVerified: Boolean((fallback as any).emailVerified),
        } as typeof users.$inferSelect;
      }
    }
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (!user.orgId) return res.status(400).json({ error: 'User is not associated with an organization' });

    if (!user.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId as any, user.orgId as any))
      .limit(1);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found for organization' });
    }

    const updated = await subscriptionService.updateAutopayStatus(subscription.id as string, 'disabled');

    return res.json({
      autopay: {
        enabled: false,
        provider: updated.autopayProvider,
        status: updated.autopayLastStatus,
        configuredAt: toIsoString(updated.autopayConfiguredAt as any),
        details: null,
      },
    });
  });
}


