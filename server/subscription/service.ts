import { eq, and, lte, sql } from 'drizzle-orm';
import type { QueryResult } from 'pg';

import { subscriptions as prdSubscriptions } from '@shared/prd-schema';
import { subscriptions, subscriptionPayments, users } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';

export class SubscriptionService {
  private subscriptionsHasUserIdColumn: boolean | null = null;
  private subscriptionColumns: Set<string> | null = null;
  private subscriptionStatusValues: string[] | null = null;

  private async getSubscriptionColumns(): Promise<Set<string>> {
    if (this.subscriptionColumns) {
      return this.subscriptionColumns;
    }

    try {
      const result = await db.execute<{ column_name: string }>(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions'`
      );
      const rows = Array.isArray(result)
        ? result
        : Array.isArray((result as QueryResult<any>).rows)
          ? (result as QueryResult<any>).rows
          : [];
      this.subscriptionColumns = new Set(rows.map((row) => row.column_name));
    } catch (error) {
      logger.warn('SubscriptionService failed to load subscription columns', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.subscriptionColumns = new Set();
    }

    return this.subscriptionColumns;
  }

  private async ensureSubscriptionUserIdCapability(): Promise<boolean> {
    if (this.subscriptionsHasUserIdColumn !== null) {
      return this.subscriptionsHasUserIdColumn;
    }

    const columns = await this.getSubscriptionColumns();
    this.subscriptionsHasUserIdColumn = columns.has('user_id');
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
    const subscriptionColumns = await this.getSubscriptionColumns();
    const statusValue = await this.resolveSubscriptionStatus('TRIAL');

    const subscriptionData: typeof subscriptions.$inferInsert = {
      orgId,
      tier,
      planCode,
      provider,
      status: statusValue as typeof subscriptions.$inferInsert['status'],
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
      const insertColumns: string[] = [];
      const insertValues: Array<typeof sql> = [];

      const pushColumn = (column: string, value: unknown) => {
        if (subscriptionColumns.has(column)) {
          insertColumns.push(column);
          insertValues.push(sql`${value}`);
        }
      };

      pushColumn('org_id', orgId);
      pushColumn('tier', tier);
      pushColumn('plan_code', planCode);
      pushColumn('provider', provider);
      pushColumn('status', statusValue);
      pushColumn('upfront_fee_paid', subscriptionData.upfrontFeePaid);
      pushColumn('upfront_fee_currency', upfrontFeeCurrency);
      pushColumn('monthly_amount', subscriptionData.monthlyAmount);
      pushColumn('monthly_currency', monthlyCurrency);
      pushColumn('trial_start_date', trialStartDate);
      pushColumn('trial_end_date', trialEndDate);
      pushColumn('upfront_fee_credited', subscriptionData.upfrontFeeCredited);
      pushColumn('created_at', trialStartDate);
      pushColumn('updated_at', trialStartDate);

      if (insertColumns.length === 0) {
        throw new Error('Unable to insert subscription: no compatible columns found');
      }

      const columnSql = sql.join(insertColumns.map((column) => sql.identifier(column)), sql`, `);
      const valuesSql = sql.join(insertValues, sql`, `);

      const returningColumns = ['id', ...insertColumns.filter((column) => column !== 'id')];
      const returningSql = sql.join(returningColumns.map((column) => sql.identifier(column)), sql`, `);

      const insertResult = await db.execute(
        sql`INSERT INTO subscriptions (${columnSql}) VALUES (${valuesSql}) RETURNING ${returningSql}`
      );

      const inserted = this.extractFirstRow(insertResult) as Record<string, unknown>;

      subscription = {
        id: inserted.id as string,
        orgId: (inserted.org_id as string) ?? orgId,
        userId: null,
        tier: (inserted.tier as string) ?? tier,
        planCode: (inserted.plan_code as string) ?? planCode,
        provider: (inserted.provider as typeof subscriptionData.provider) ?? provider,
        status: (inserted.status as typeof subscriptionData.status) ?? (statusValue as typeof subscriptionData.status),
        upfrontFeePaid: (inserted.upfront_fee_paid as typeof subscriptionData.upfrontFeePaid) ?? subscriptionData.upfrontFeePaid,
        upfrontFeeCurrency: (inserted.upfront_fee_currency as string) ?? upfrontFeeCurrency,
        monthlyAmount: (inserted.monthly_amount as typeof subscriptionData.monthlyAmount) ?? subscriptionData.monthlyAmount,
        monthlyCurrency: (inserted.monthly_currency as string) ?? monthlyCurrency,
        trialStartDate: (inserted.trial_start_date as Date | null) ?? trialStartDate,
        trialEndDate: (inserted.trial_end_date as Date | null) ?? trialEndDate,
        upfrontFeeCredited: (inserted.upfront_fee_credited as boolean | null) ?? subscriptionData.upfrontFeeCredited,
        createdAt: (inserted.created_at as Date | null) ?? trialStartDate,
        updatedAt: (inserted.updated_at as Date | null) ?? trialStartDate,
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
