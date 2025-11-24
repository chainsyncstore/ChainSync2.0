import { eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { organizations, stores, subscriptions, users } from '@shared/schema';

import { db } from '../db';
import { getAutopayVerificationAmountMinor, getTierAmountMinor, resolveClientBillingRedirectBase } from '../lib/billing';
import { VALID_TIERS, type ValidTier } from '../lib/constants';
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
  paymentMethod: z.enum(['card', 'bank']).optional(),
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

function getQueryString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractAutopayReference(query: Request['query']): string | null {
  const keys = ['reference', 'trxref', 'trx_ref', 'tx_ref', 'ref', 'paymentReference'];
  for (const key of keys) {
    const candidate = getQueryString((query as Record<string, unknown>)[key]);
    if (candidate) return candidate;
  }
  return null;
}

function detectProvider(
  providerValue: string | null,
  reference: string | null,
): 'PAYSTACK' | 'FLW' {
  const normalized = providerValue?.toUpperCase() ?? '';
  if (normalized.startsWith('FLW') || normalized.includes('FLUTTER')) {
    return 'FLW';
  }
  if (reference?.toUpperCase().includes('FLW') || reference?.toUpperCase().includes('FLUTTER')) {
    return 'FLW';
  }
  return 'PAYSTACK';
}

function renderAutopayResultHtml(title: string, message: string, success: boolean) {
  const accent = success ? '#16a34a' : '#dc2626';
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); max-width: 420px; text-align: center; }
        .status { font-size: 18px; font-weight: 600; color: ${accent}; margin-bottom: 12px; }
        p { line-height: 1.5; margin: 0; color: #475569; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="status">${title}</div>
        <p>${message}</p>
      </div>
    </body>
  </html>`;
}

function redirectAutopayResult(
  res: Response,
  params: Record<string, string | undefined>,
  fallbackHtml: { title: string; message: string; success: boolean; statusCode?: number },
) {
  const enrichedParams: Record<string, string | undefined> = { ...params };
  if (!enrichedParams.autopay) {
    enrichedParams.autopay = fallbackHtml.success ? 'success' : 'error';
  }
  if (!enrichedParams.autopayMessage && fallbackHtml.message) {
    enrichedParams.autopayMessage = fallbackHtml.message;
  }

  const clientBase = resolveClientBillingRedirectBase();
  if (clientBase) {
    const query = new URLSearchParams();
    Object.entries(enrichedParams).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0) {
        query.set(key, value);
      }
    });
    const url = `${clientBase}/admin/billing?${query.toString()}`;
    return res.redirect(302, url);
  }

  return res
    .status(fallbackHtml.statusCode ?? (fallbackHtml.success ? 200 : 400))
    .send(renderAutopayResultHtml(fallbackHtml.title, fallbackHtml.message, fallbackHtml.success));
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
  app.get('/api/billing/autopay/callback', async (req: Request, res: Response) => {
    const intent = getQueryString(req.query.intent);
    if (intent && intent !== 'autopay_verification') {
      return redirectAutopayResult(res, {}, {
        title: 'Unsupported intent',
        message: 'This callback is reserved for autopay verification.',
        success: false,
        statusCode: 400,
      });
    }

    const reference = extractAutopayReference(req.query);
    if (!reference) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing reference',
        message: 'Payment reference was not provided in the callback.',
        success: false,
        statusCode: 400,
      });
    }

    const orgIdQuery = getQueryString(req.query.orgId);
    const planCodeQuery = getQueryString(req.query.planCode);
    const providerHint = getQueryString(req.query.provider);
    const provider = detectProvider(providerHint, reference);

    const paymentService = new PaymentService();
    let transaction: any;
    try {
      transaction = provider === 'PAYSTACK'
        ? await paymentService.fetchPaystackTransaction(reference)
        : await paymentService.fetchFlutterwaveTransaction(reference);
    } catch (error) {
      logger.error('Autopay callback failed to fetch transaction', {
        provider,
        reference,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Verification failed',
        message: 'Unable to verify the payment with the provider. Please try again.',
        success: false,
      });
    }

    const metadata = transaction?.metadata || transaction?.meta || {};
    const resolvedOrgId = orgIdQuery || metadata.orgId || metadata.org_id;
    const resolvedPlanCode = planCodeQuery || metadata.planCode || metadata.plan_code || transaction?.plan || undefined;
    if (!resolvedOrgId) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing organization',
        message: 'Unable to determine which organization this payment belongs to.',
        success: false,
      });
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, resolvedOrgId))
      .limit(1);

    if (!subscription) {
      return redirectAutopayResult(res, {}, {
        title: 'Subscription not found',
        message: 'We could not find a subscription for this organization.',
        success: false,
      });
    }

    let autopayDetails: AutopayDetails | null = null;
    try {
      autopayDetails = await paymentService.getAutopayDetails(provider, reference);
    } catch (error) {
      logger.error('Autopay callback failed to resolve authorization', {
        provider,
        reference,
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Authorization failed',
        message: 'Unable to capture the payment authorization. Please try again.',
        success: false,
      });
    }

    if (!autopayDetails?.autopayReference) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing authorization',
        message: 'The payment was verified but no reusable authorization was returned.',
        success: false,
      });
    }

    try {
      await subscriptionService.configureAutopay(
        subscription.id as string,
        provider,
        autopayDetails.autopayReference,
      );
    } catch (error) {
      logger.error('Failed to configure autopay after callback', {
        subscriptionId: subscription.id,
        provider,
        reference,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Autopay setup failed',
        message: 'We verified the payment but could not save the payment method. Please contact support.',
        success: false,
      });
    }

    const verificationCurrency = resolveCurrencyFromProvider(provider);
    const verificationAmountMinor = getAutopayVerificationAmountMinor(verificationCurrency);
    const refundAmountMajor = verificationAmountMinor / 100;

    try {
      if (provider === 'PAYSTACK') {
        const transactionId = transaction?.id || reference;
        await paymentService.refundPaystackTransaction(transactionId, verificationAmountMinor);
      } else {
        const transactionId = transaction?.id || transaction?.flw_ref || reference;
        await paymentService.refundFlutterwaveTransaction(transactionId, refundAmountMajor, verificationCurrency);
      }
    } catch (error) {
      logger.warn('Autopay verification refund failed', {
        provider,
        reference,
        transactionId: transaction?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return redirectAutopayResult(
      res,
      {
        autopay: 'success',
        orgId: resolvedOrgId,
        planCode: resolvedPlanCode,
        provider,
        reference,
      },
      {
        title: 'Payment method saved',
        message: 'Your payment method has been verified and saved successfully.',
        success: true,
      },
    );
  });

  app.get('/api/billing/autopay/callback', async (req: Request, res: Response) => {
    const intent = getQueryString(req.query.intent);
    if (intent && intent !== 'autopay_verification') {
      return redirectAutopayResult(res, {}, {
        title: 'Unsupported intent',
        message: 'This callback is reserved for autopay verification.',
        success: false,
        statusCode: 400,
      });
    }

    const reference = extractAutopayReference(req.query);
    if (!reference) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing reference',
        message: 'Payment reference was not provided in the callback.',
        success: false,
        statusCode: 400,
      });
    }

    const orgIdQuery = getQueryString(req.query.orgId);
    const planCodeQuery = getQueryString(req.query.planCode);
    const providerHint = getQueryString(req.query.provider);
    const provider = detectProvider(providerHint, reference);

    const paymentService = new PaymentService();
    let transaction: any;
    try {
      transaction = provider === 'PAYSTACK'
        ? await paymentService.fetchPaystackTransaction(reference)
        : await paymentService.fetchFlutterwaveTransaction(reference);
    } catch (error) {
      logger.error('Autopay callback failed to fetch transaction', {
        provider,
        reference,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Verification failed',
        message: 'Unable to verify the payment with the provider. Please try again.',
        success: false,
      });
    }

    const metadata = transaction?.metadata || transaction?.meta || {};
    const resolvedOrgId = orgIdQuery || metadata.orgId || metadata.org_id;
    const resolvedPlanCode = planCodeQuery || metadata.planCode || metadata.plan_code || transaction?.plan || undefined;
    if (!resolvedOrgId) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing organization',
        message: 'Unable to determine which organization this payment belongs to.',
        success: false,
      });
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, resolvedOrgId))
      .limit(1);

    if (!subscription) {
      return redirectAutopayResult(res, {}, {
        title: 'Subscription not found',
        message: 'We could not find a subscription for this organization.',
        success: false,
      });
    }

    let autopayDetails: AutopayDetails | null = null;
    try {
      autopayDetails = await paymentService.getAutopayDetails(provider, reference);
    } catch (error) {
      logger.error('Autopay callback failed to resolve authorization', {
        provider,
        reference,
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Authorization failed',
        message: 'Unable to capture the payment authorization. Please try again.',
        success: false,
      });
    }

    if (!autopayDetails?.autopayReference) {
      return redirectAutopayResult(res, {}, {
        title: 'Missing authorization',
        message: 'The payment was verified but no reusable authorization was returned.',
        success: false,
      });
    }

    try {
      await subscriptionService.configureAutopay(
        subscription.id as string,
        provider,
        autopayDetails.autopayReference,
      );
    } catch (error) {
      logger.error('Failed to configure autopay after callback', {
        subscriptionId: subscription.id,
        provider,
        reference,
        error: error instanceof Error ? error.message : String(error),
      });
      return redirectAutopayResult(res, {}, {
        title: 'Autopay setup failed',
        message: 'We verified the payment but could not save the payment method. Please contact support.',
        success: false,
      });
    }

    const verificationCurrency = resolveCurrencyFromProvider(provider);
    const verificationAmountMinor = getAutopayVerificationAmountMinor(verificationCurrency);
    const refundAmountMajor = verificationAmountMinor / 100;

    try {
      if (provider === 'PAYSTACK') {
        const transactionId = transaction?.id || reference;
        await paymentService.refundPaystackTransaction(transactionId, verificationAmountMinor);
      } else {
        const transactionId = transaction?.id || transaction?.flw_ref || reference;
        await paymentService.refundFlutterwaveTransaction(transactionId, refundAmountMajor, verificationCurrency);
      }
    } catch (error) {
      logger.warn('Autopay verification refund failed', {
        provider,
        reference,
        transactionId: transaction?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return redirectAutopayResult(
      res,
      {
        autopay: 'success',
        orgId: resolvedOrgId,
        planCode: resolvedPlanCode,
        provider,
      },
      {
        title: 'Payment method saved',
        message: 'Your payment method has been verified and saved successfully.',
        success: true,
      },
    );
  });

  app.post('/api/billing/subscribe', requireAuth, async (req: Request, res: Response) => {
    const currentUserId = (req.session as any)?.userId as string | undefined;
    if (!currentUserId) return res.status(401).json({ error: 'Not authenticated' });

    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { orgId, planCode, email, paymentMethod: requestedPaymentMethod } = parsed.data;
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

    const paymentMethod = provider === 'PAYSTACK' && requestedPaymentMethod === 'bank'
      ? 'bank'
      : 'card';
    const service = new PaymentService();
    const reference = service.generateReference(provider === 'PAYSTACK' ? 'paystack' : 'flutterwave');
    const callbackBase = process.env.BASE_URL || process.env.APP_URL;
    if (!callbackBase) {
      return res.status(500).json({ error: 'Payment callback URL is not configured' });
    }

    const callbackParams = new URLSearchParams({
      orgId,
      planCode: plan.code,
      provider,
      intent: 'autopay_verification',
    });
    const callbackUrl = `${callbackBase.replace(/\/$/, '')}/api/billing/autopay/callback?${callbackParams.toString()}`;

    const metadata = {
      orgId,
      planCode: plan.code,
      intent: 'autopay_verification',
      preferredChannel: paymentMethod,
    } as Record<string, any>;

    const verificationAmountMinor = getAutopayVerificationAmountMinor(currency);
    const amountForProvider = provider === 'PAYSTACK'
      ? verificationAmountMinor
      : Number((verificationAmountMinor / 100).toFixed(2));

    const paystackChannels = paymentMethod === 'bank'
      ? ['bank', 'card']
      : ['card'];

    const resp = provider === 'PAYSTACK'
      ? await service.initializePaystackPayment({
          email,
          amount: amountForProvider,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata,
          channels: paystackChannels,
        })
      : await service.initializeFlutterwavePayment({
          email,
          amount: amountForProvider,
          currency: 'USD',
          reference,
          callback_url: callbackUrl,
          metadata,
          paymentOptions: paymentMethod === 'bank' ? 'account,card' : 'card',
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
        trialStartAt: toIsoString(subscription.trialStartDate as any),
        trialEndsAt: toIsoString(subscription.trialEndDate as any),
        autopayEnabled: Boolean(subscription.autopayEnabled),
        autopayProvider: subscription.autopayProvider,
        autopayLastStatus: subscription.autopayLastStatus,
        currencySymbol: currentCurrencySymbol,
        startedAt: toIsoString(subscription.startedAt as any),
        currentPeriodEnd: toIsoString(subscription.currentPeriodEnd as any),
        createdAt: toIsoString(subscription.createdAt as any),
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


