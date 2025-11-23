import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { organizations, stores, subscriptions, users } from '@shared/schema';

import { db } from '../db';
import { PRICING_TIERS, VALID_TIERS, type ValidTier } from '../lib/constants';
import { logger } from '../lib/logger';
import { getPlan } from '../lib/plans';
import { requireAuth, requireRole } from '../middleware/authz';
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
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const currencySymbols: Record<string, string> = {
  NGN: '₦',
  USD: '$',
};

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

function resolveCurrencyFromProvider(provider?: string | null) {
  if (!provider) return 'NGN';
  const normalized = provider.toUpperCase();
  return normalized === 'FLW' || normalized.startsWith('FLUTTERWAVE') ? 'USD' : 'NGN';
}

function getTierAmountMinor(tier: ValidTier, currency: 'NGN' | 'USD') {
  const config = PRICING_TIERS[tier];
  return currency === 'USD' ? config.usd : config.ngn;
}

async function buildAutopaySummary(subscription: typeof subscriptions.$inferSelect) {
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

  return {
    enabled: !!subscription.autopayEnabled,
    provider: subscription.autopayProvider,
    status: subscription.autopayLastStatus,
    configuredAt: toIsoString(subscription.autopayConfiguredAt as any),
    details: summarizeAutopayDetails(autopayDetails),
  } as const;
}

export async function registerBillingRoutes(app: Express) {
  app.post('/api/billing/subscribe', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { orgId, planCode, email } = parsed.data;
    const plan = getPlan(planCode);
    if (!plan) return res.status(400).json({ error: 'Invalid plan code' });

    // Verify org exists
    const orgRows = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const org = orgRows[0];
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [existingSubscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);

    const resolvedProvider = (existingSubscription?.provider || process.env.DEFAULT_PAYMENT_PROVIDER || 'PAYSTACK')
      .toString()
      .toUpperCase();
    const provider: 'PAYSTACK' | 'FLW' = resolvedProvider.startsWith('FLW') ? 'FLW' : 'PAYSTACK';
    const currency: 'NGN' | 'USD' = resolveCurrencyFromProvider(provider) as 'NGN' | 'USD';

    const service = new PaymentService();
    const reference = service.generateReference(provider === 'PAYSTACK' ? 'paystack' : 'flutterwave');
    const callbackUrl = `${process.env.BASE_URL || process.env.APP_URL}/payment/callback?orgId=${orgId}&planCode=${plan.code}`;

    const providerPlanEnvKey = `${provider === 'PAYSTACK' ? 'PAYSTACK' : 'FLW'}_PLAN_ID_${plan.code.toUpperCase()}`;
    const providerPlanId = process.env[providerPlanEnvKey] || process.env[`PROVIDER_PLAN_ID_${plan.code.toUpperCase()}`];

    const amountMinor = getTierAmountMinor(plan.code as ValidTier, currency);

    const resp = provider === 'PAYSTACK'
      ? await service.initializePaystackPayment({
          email,
          amount: amountMinor,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: { orgId, planCode: plan.code },
          providerPlanId,
        })
      : await service.initializeFlutterwavePayment({
          email,
          amount: amountMinor,
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

    const autopay = await buildAutopaySummary(subscription);

    return res.json({ autopay });
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

  app.get('/api/billing/overview', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
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
          email: fallback.email,
        } as typeof users.$inferSelect;
      }
    }

    if (!user || !user.orgId) {
      return res.status(400).json({ error: 'User is not associated with an organization' });
    }

    const orgRows = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
    const organization = orgRows[0];

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, user.orgId))
      .limit(1);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found for organization' });
    }

    const plan = getPlan((subscription.planCode ?? subscription.tier ?? 'basic').toLowerCase());
    const storeRows = await db
      .select({ id: stores.id, isActive: stores.isActive })
      .from(stores)
      .where(eq(stores.orgId, user.orgId));

    const activeStores = storeRows.filter((store) => store.isActive !== false).length;
    const inactiveStores = storeRows.length - activeStores;
    const planStoreLimit = Number.isFinite(plan?.maxStores ?? Infinity) ? Number(plan?.maxStores ?? 0) : null;
    const requiresStoreReduction = typeof planStoreLimit === 'number' && activeStores > planStoreLimit;

    const trialEndsAt = subscription.trialEndDate ? new Date(subscription.trialEndDate as any) : null;
    const daysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / ONE_DAY_MS))
      : null;
    const currencyCode = resolveCurrencyFromProvider(subscription.provider) as 'NGN' | 'USD';
    const currentCurrencySymbol = currencySymbols[currencyCode] ?? '';
    const autopay = await buildAutopaySummary(subscription);

    const pricingTiers = (VALID_TIERS as ReadonlyArray<ValidTier>).map((tier) => {
      const tierPlan = getPlan(tier) ?? plan;
      const amountMinor = getTierAmountMinor(tier, currencyCode);
      const monthlyAmount = amountMinor / 100;
      const tierLimit = Number.isFinite(tierPlan.maxStores) ? Number(tierPlan.maxStores) : null;
      const isDowngrade = Boolean(plan && tierPlan.maxStores < plan.maxStores);
      const needsReduction = typeof tierLimit === 'number' && activeStores > tierLimit;

      return {
        tier,
        code: tierPlan.code,
        monthlyAmountMinor: amountMinor,
        monthlyAmount,
        currency: currencyCode,
        currencySymbol: currencySymbols[currencyCode] ?? '',
        maxStores: tierLimit,
        isCurrent: tier === (subscription.tier ?? '').toLowerCase(),
        isDowngrade,
        requiresStoreReduction: needsReduction,
        disabledReason: needsReduction
          ? `Deactivate ${activeStores - tierLimit} store(s) to move to ${tierPlan.name}`
          : null,
      };
    });

    const trialReminders = {
      sent7Day: toIsoString(subscription.trialReminder7SentAt as any),
      sent3Day: toIsoString(subscription.trialReminder3SentAt as any),
    };

    return res.json({
      subscription: {
        id: subscription.id,
        tier: subscription.tier,
        planCode: subscription.planCode,
        provider: subscription.provider,
        status: subscription.status,
        monthlyAmount: Number(subscription.monthlyAmount ?? 0),
        monthlyCurrency: subscription.monthlyCurrency,
        nextBillingDate: toIsoString(subscription.nextBillingDate as any),
        trialEndsAt: toIsoString(subscription.trialEndDate as any),
        autopayEnabled: Boolean(subscription.autopayEnabled),
        autopayProvider: subscription.autopayProvider,
        autopayLastStatus: subscription.autopayLastStatus,
        currencySymbol: currentCurrencySymbol,
      },
      autopay,
      stores: {
        active: activeStores,
        inactive: inactiveStores,
        total: storeRows.length,
        limit: planStoreLimit,
        requiresStoreReduction,
      },
      pricing: {
        provider: subscription.provider,
        currency: currencyCode,
        currencySymbol: currentCurrencySymbol,
        tiers: pricingTiers,
      },
      trial: {
        endsAt: toIsoString(subscription.trialEndDate as any),
        daysRemaining,
        reminders: trialReminders,
        status: subscription.status,
      },
      organization: {
        id: organization?.id ?? user.orgId,
        name: organization?.name ?? null,
        billingEmail: organization?.billingEmail ?? null,
        adminEmail: user.email ?? null,
      },
      recommendations: {
        needsAutopay: subscription.status?.toUpperCase() === 'TRIAL' && !subscription.autopayEnabled,
      },
    });
  });
}


