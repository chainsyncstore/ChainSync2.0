import { eq, and, lte, sql } from 'drizzle-orm';
import type { QueryResult } from 'pg';

import { subscriptions as prdSubscriptions } from '@shared/prd-schema';
import { subscriptions, subscriptionPayments, users } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';

export class SubscriptionService {
  private subscriptionsHasUserIdColumn: boolean | null = null;

  private async ensureSubscriptionUserIdCapability(): Promise<boolean> {
    if (this.subscriptionsHasUserIdColumn !== null) {
      return this.subscriptionsHasUserIdColumn;
    }

    try {
      const result = await db.execute<{ exists: number }>(
        sql`SELECT 1 AS exists FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id' LIMIT 1`
      );
      const rows = Array.isArray(result)
        ? result
        : Array.isArray((result as QueryResult<any>).rows)
          ? (result as QueryResult<any>).rows
          : [];
      this.subscriptionsHasUserIdColumn = rows.length > 0;
    } catch (error) {
      logger.warn('SubscriptionService schema capability check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.subscriptionsHasUserIdColumn = false;
    }

    return this.subscriptionsHasUserIdColumn;
  }

  private extractFirstRow<T>(result: T[] | QueryResult<any>): T {
    const row = Array.isArray(result) ? result[0] : (result.rows?.[0] as T | undefined);
    if (!row) {
      throw new Error('No rows returned from database operation');
    }

    return row;
  }

  /**
   * Create a new subscription for a user after successful upfront fee payment
   */
  async createSubscription(
    userId: string,
    orgId: string,
    tier: string,
    planCode: string,
    provider: 'PAYSTACK' | 'FLW',
    upfrontFeeAmount: number,
    upfrontFeeCurrency: string,
    monthlyAmount: number,
    monthlyCurrency: string
  ) {
    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14); // 2-week trial

    const supportsUserIdColumn = await this.ensureSubscriptionUserIdCapability();

    const subscriptionData: typeof subscriptions.$inferInsert = {
      orgId,
      tier,
      planCode,
      provider,
      status: 'TRIAL',
      upfrontFeePaid: (upfrontFeeAmount / 100).toFixed(2),
      upfrontFeeCurrency,
      monthlyAmount: (monthlyAmount / 100).toFixed(2),
      monthlyCurrency,
      trialStartDate,
      trialEndDate,
      upfrontFeeCredited: false,
    } as any;

    if (supportsUserIdColumn) {
      subscriptionData.userId = userId;
    }

    logger.info('createSubscription:start', { userId, tier, upfrontFeeAmount, monthlyAmount });

    let subscription: typeof subscriptions.$inferSelect;
    if (supportsUserIdColumn) {
      const existing = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);
      const existingSubscription = existing[0];

      if (existingSubscription) {
        subscription = existingSubscription;
        logger.info('createSubscription:reuse', { userId, subscriptionId: subscription.id });
      } else {
        const insertResult = await db
          .insert(subscriptions)
          .values(subscriptionData)
          .returning();
        subscription = this.extractFirstRow<typeof subscriptions.$inferSelect>(insertResult);
        logger.info('createSubscription:insert', { userId, subscriptionId: subscription.id });
      }
    } else {
      const insertResult = await db.execute(
        sql`INSERT INTO subscriptions (
              org_id,
              tier,
              plan_code,
              provider,
              status,
              upfront_fee_paid,
              upfront_fee_currency,
              monthly_amount,
              monthly_currency,
              trial_start_date,
              trial_end_date,
              upfront_fee_credited,
              created_at,
              updated_at
            ) VALUES (
              ${orgId},
              ${tier},
              ${planCode},
              ${provider},
              ${'TRIAL'},
              ${subscriptionData.upfrontFeePaid},
              ${upfrontFeeCurrency},
              ${subscriptionData.monthlyAmount},
              ${monthlyCurrency},
              ${trialStartDate},
              ${trialEndDate},
              ${subscriptionData.upfrontFeeCredited},
              ${trialStartDate},
              ${trialStartDate}
            )
            RETURNING id,
              org_id,
              tier,
              plan_code,
              provider,
              status,
              upfront_fee_paid,
              upfront_fee_currency,
              monthly_amount,
              monthly_currency,
              trial_start_date,
              trial_end_date,
              upfront_fee_credited,
              created_at,
              updated_at`
      );

      const inserted = this.extractFirstRow(insertResult);

      subscription = {
        id: inserted.id,
        orgId: inserted.org_id,
        userId: null,
        tier: inserted.tier,
        planCode: inserted.plan_code,
        provider: inserted.provider,
        status: inserted.status,
        upfrontFeePaid: inserted.upfront_fee_paid,
        upfrontFeeCurrency: inserted.upfront_fee_currency,
        monthlyAmount: inserted.monthly_amount,
        monthlyCurrency: inserted.monthly_currency,
        trialStartDate: inserted.trial_start_date,
        trialEndDate: inserted.trial_end_date,
        upfrontFeeCredited: inserted.upfront_fee_credited,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at,
      } as typeof subscriptions.$inferSelect;

      logger.info('createSubscription:insert:compat', { userId, subscriptionId: subscription.id });
    }

    // Update user with subscription ID
    await db.update(users)
      .set({ subscriptionId: subscription.id } as any)
      .where(eq(users.id, userId));

    logger.info('createSubscription:complete', { userId, subscriptionId: subscription.id });

    return subscription;
  }

  async markTrialReminderSent(
    subscriptionId: string,
    type: '7_day' | '3_day'
  ) {
    const column = type === '7_day' ? 'trialReminder7SentAt' : 'trialReminder3SentAt';
    const updateResult = await db
      .update(subscriptions)
      .set({ [column]: new Date(), updatedAt: new Date() } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
  }

  async configureAutopay(
    subscriptionId: string,
    provider: 'PAYSTACK' | 'FLW',
    reference: string
  ) {
    const now = new Date();

    const updateResult = await db
      .update(subscriptions)
      .set({
        autopayEnabled: true,
        autopayProvider: provider,
        autopayReference: reference,
        autopayConfiguredAt: now,
        autopayLastStatus: 'configured',
        updatedAt: now,
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await db
      .update(prdSubscriptions)
      .set({
        autopayEnabled: true,
        autopayProvider: provider,
        autopayReference: reference,
        autopayConfiguredAt: now,
        autopayLastStatus: 'configured',
        updatedAt: now,
      } as any)
      .where(eq(prdSubscriptions.id, subscriptionId));

    return this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
  }

  async updateAutopayStatus(
    subscriptionId: string,
    status: 'configured' | 'pending_charge' | 'charged' | 'failed' | 'disabled'
  ) {
    const now = new Date();
    const disabledPatch = status === 'disabled'
      ? {
          autopayEnabled: false,
          autopayProvider: null,
          autopayReference: null,
          autopayConfiguredAt: null,
        }
      : {};

    const updateResult = await db
      .update(subscriptions)
      .set({
        autopayLastStatus: status,
        updatedAt: now,
        ...disabledPatch,
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await db
      .update(prdSubscriptions)
      .set({
        autopayLastStatus: status,
        updatedAt: now,
        ...disabledPatch,
      } as any)
      .where(eq(prdSubscriptions.id, subscriptionId));

    return this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
  }

  /**
   * Record a payment for a subscription
   */
  async recordPayment(
    subscriptionId: string,
    paymentReference: string,
    amount: number,
    currency: string,
    paymentType: 'upfront_fee' | 'monthly_billing',
    status: 'pending' | 'completed' | 'failed',
    provider: 'paystack' | 'flutterwave',
    metadata?: any
  ) {
    const paymentData = {
      subscriptionId,
      paymentReference,
      amount: (amount / 100).toFixed(2),
      currency,
      paymentType,
      status: status.toUpperCase() as typeof subscriptionPayments.$inferInsert['status'],
      provider,
      ...(metadata !== undefined ? { metadata: metadata ?? null } : {}),
    } as typeof subscriptionPayments.$inferInsert;

    const paymentResult = await db.insert(subscriptionPayments).values(paymentData).returning();
    return this.extractFirstRow<typeof subscriptionPayments.$inferSelect>(paymentResult);
  }

  /**
   * Get subscription by user ID
   */
  async getSubscriptionByUserId(userId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(subscriptionId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    return subscription;
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(subscriptionId: string, status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended') {
    const normalizedStatus = status.toUpperCase();
    const updateResult = await db
      .update(subscriptions)
      .set({ 
        status: normalizedStatus as any,
        updatedAt: new Date()
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
  }

  /**
   * Mark upfront fee as credited (when first monthly billing occurs)
   */
  async markUpfrontFeeCredited(subscriptionId: string) {
    const updateResult = await db
      .update(subscriptions)
      .set({ 
        upfrontFeeCredited: true as any,
        updatedAt: new Date()
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
  }

  /**
   * Get all subscriptions that need to be billed (trial ended, upfront fee credited)
   */
  async getSubscriptionsForBilling() {
    const now = new Date();
    
    const subscriptionsForBilling = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'TRIAL'),
          lte(subscriptions.trialEndDate, now),
          eq(subscriptions.upfrontFeeCredited, true)
        )
      );

    return subscriptionsForBilling;
  }

  /**
   * Get all subscriptions that need upfront fee credit applied
   */
  async getSubscriptionsForUpfrontFeeCredit() {
    const now = new Date();
    
    const subscriptionsForCredit = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'TRIAL'),
          lte(subscriptions.trialEndDate, now),
          eq(subscriptions.upfrontFeeCredited, false)
        )
      );

    return subscriptionsForCredit;
  }

  /**
   * Get payment history for a subscription
   */
  async getPaymentHistory(subscriptionId: string) {
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, subscriptionId))
      .orderBy(subscriptionPayments.createdAt);

    return payments;
  }

  /**
   * Calculate the amount to bill for first month (monthly amount minus upfront fee)
   */
  calculateFirstMonthBillingAmount(subscription: any) {
    if (subscription.upfrontFeeCredited) {
      return 0; // Already credited
    }

    const monthlyAmount = parseFloat(subscription.monthlyAmount);
    const upfrontFee = parseFloat(subscription.upfrontFeePaid);
    
    // Ensure we don't charge negative amounts
    return Math.max(0, monthlyAmount - upfrontFee);
  }

  /**
   * Check if a subscription is eligible for upfront fee credit
   */
  isEligibleForUpfrontFeeCredit(subscription: any) {
    const now = new Date();
    const trialEnded = new Date(subscription.trialEndDate) <= now;
    const notYetCredited = !subscription.upfrontFeeCredited;
    
    return trialEnded && notYetCredited;
  }

  /**
   * Update subscription tier and return old/new values
   */
  async updateSubscriptionTier(subscriptionId: string, newTier: string) {
    // Fetch current subscription
    const [oldSub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
    if (!oldSub) throw new Error('Subscription not found');
    if (oldSub.tier === newTier) return { changed: false, oldTier: oldSub.tier, newTier };
    const updateResult = await db.update(subscriptions)
      .set({ tier: newTier, updatedAt: new Date() } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    const updated = this.extractFirstRow<typeof subscriptions.$inferSelect>(updateResult);
    return { changed: true, oldTier: oldSub.tier, newTier: updated.tier, subscription: updated };
  }
}
