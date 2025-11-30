import { and, eq, lte, sql } from 'drizzle-orm';
import type { QueryResult } from 'pg';

import { subscriptions, subscriptionPayments, stores, users } from '../../shared/schema';
import { db } from '../db';
import { VALID_TIERS, type ValidTier } from '../lib/constants';
import { logger } from '../lib/logger';
import { getPlan, type Plan } from '../lib/plans';

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
      const columns = rows
        .map((row) => row?.column_name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      this.subscriptionColumns = new Set(columns);
    } catch (error) {
      logger.warn('SubscriptionService failed to load subscription columns', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.subscriptionColumns = new Set();
    }

    return this.subscriptionColumns;
  }

  private resolvePlanCode(tier: string): string {
    const plan = getPlan(tier.toLowerCase());
    return plan?.code ?? tier.toLowerCase();
  }

  private validateTier(tier: string): asserts tier is ValidTier {
    if (!VALID_TIERS.includes(tier.toLowerCase() as ValidTier)) {
      throw new InvalidPlanChangeError('Unsupported tier selected', 'UNSUPPORTED_TIER');
    }
  }

  private async countStoresForOrg(orgId: string): Promise<number> {
    const rows = await db
      .select()
      .from(stores)
      .where(eq(stores.orgId as any, orgId as any));

    const list = Array.isArray(rows)
      ? rows
      : Array.isArray((rows as QueryResult<any>).rows)
        ? (rows as QueryResult<any>).rows
        : [];

    return list.filter((store) => (store?.isActive ?? true) !== false).length;
  }

  private buildBillingImpact(
    current: typeof subscriptions.$inferSelect,
    targetPlan: Plan
  ) {
    const status = (current.status ?? '').toString().toUpperCase();
    const now = Date.now();
    const nextBilling = current.nextBillingDate
      ? new Date(current.nextBillingDate).getTime()
      : null;
    const trialEnd = current.trialEndDate
      ? new Date(current.trialEndDate).getTime()
      : null;

    if (status === 'TRIAL') {
      return {
        type: 'TRIAL' as const,
        requiresAcknowledgement: false,
        message: `Your plan change to ${targetPlan.name} will apply immediately and remain in effect for the rest of your trial${
          trialEnd ? `, which ends on ${new Date(trialEnd).toISOString()}` : ''
        }. Billing will continue at the ${targetPlan.name} rate once the trial ends.`,
        ...(trialEnd ? { trialEndsAt: new Date(trialEnd).toISOString() } : {}),
      };
    }

    if (status === 'ACTIVE') {
      if (nextBilling && nextBilling > now) {
        return {
          type: 'FORFEIT_REMAINING' as const,
          requiresAcknowledgement: true,
          message: `Changing plan now will forfeit the remaining time on your current billing cycle, which ends on ${new Date(nextBilling).toISOString()}. You will be charged immediately for the ${targetPlan.name} plan.`,
          currentPeriodEndsAt: new Date(nextBilling).toISOString(),
        };
      }

      return {
        type: 'IMMEDIATE_CHARGE' as const,
        requiresAcknowledgement: true,
        message: `Changing plan now will charge you immediately for the ${targetPlan.name} plan. Any remaining time on your previous plan will be forfeited.`,
      };
    }

    return {
      type: 'NONE' as const,
      requiresAcknowledgement: false,
      message: `Your subscription will be moved to the ${targetPlan.name} plan.`,
    };
  }

  async changePlan(options: {
    subscriptionId: string;
    orgId: string;
    targetPlan: string;
  }) {
    const { subscriptionId, orgId, targetPlan } = options;

    this.validateTier(targetPlan);
    const normalizedTarget = targetPlan.toLowerCase();
    const plan = getPlan(normalizedTarget);
    if (!plan) {
      throw new InvalidPlanChangeError('Unknown plan code requested', 'INVALID_PLAN');
    }

    const [current] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!current) {
      throw new InvalidPlanChangeError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
    }

    if (current.orgId !== orgId) {
      throw new InvalidPlanChangeError('Subscription does not belong to organization', 'SUBSCRIPTION_MISMATCH', 403);
    }

    const existingPlanCode = (current.planCode ?? current.tier ?? '').toString().toLowerCase();
    if (existingPlanCode === normalizedTarget) {
      const billingImpact = this.buildBillingImpact(current, plan);
      return {
        subscription: current,
        plan,
        changed: false,
        billingImpact,
      } as const;
    }

    const currentPlan = getPlan((current.planCode ?? current.tier ?? 'basic').toLowerCase());
    const isDowngrade = currentPlan && currentPlan.maxStores > plan.maxStores;

    if (isDowngrade && Number.isFinite(plan.maxStores)) {
      const storeCount = await this.countStoresForOrg(orgId);
      if (storeCount > plan.maxStores) {
        throw new InvalidPlanChangeError(
          `Downgrade blocked: your org currently has ${storeCount} store(s) but the ${plan.name} plan allows up to ${plan.maxStores}. Remove stores before downgrading.`,
          'STORE_LIMIT_EXCEEDED',
          409
        );
      }
    }

    const now = new Date();
    const planCode = this.resolvePlanCode(normalizedTarget);

    const [updated] = await db
      .update(subscriptions)
      .set({
        planCode,
        tier: normalizedTarget,
        updatedAt: now,
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    const billingImpact = this.buildBillingImpact(updated, plan);

    return {
      subscription: updated,
      plan,
      changed: true,
      billingImpact,
    };
  }

  private async getSubscriptionStatusValues(): Promise<string[]> {
    if (this.subscriptionStatusValues) {
      return this.subscriptionStatusValues;
    }

    try {
      const result = await db.execute<{ enumlabel: string }>(
        sql`SELECT e.enumlabel
            FROM information_schema.columns c
            JOIN pg_type t ON c.udt_name = t.typname
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_catalog.pg_namespace n ON t.typnamespace = n.oid
            WHERE c.table_schema = 'public'
              AND c.table_name = 'subscriptions'
              AND c.column_name = 'status'
              AND n.nspname = 'public'
            ORDER BY e.enumsortorder`
      );

      const rows = Array.isArray(result)
        ? result
        : Array.isArray((result as QueryResult<any>).rows)
          ? (result as QueryResult<any>).rows
          : [];

      const enumLabels = rows
        .map((row) => row?.enumlabel)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      this.subscriptionStatusValues = enumLabels.length > 0
        ? enumLabels
        : ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'];
    } catch (error) {
      logger.warn('SubscriptionService failed to load subscription status enum values', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.subscriptionStatusValues = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'];
    }

    return this.subscriptionStatusValues;
  }

  private resolveSubscriptionStatus = async (preferred: string): Promise<string> => {
    const statusValues = await this.getSubscriptionStatusValues();

    if (statusValues.length === 0) {
      return preferred;
    }

    if (statusValues.includes(preferred)) {
      return preferred;
    }

    const normalizedPreferred = preferred.toLowerCase();
    const looseMatch = statusValues.find((value) => value.toLowerCase() === normalizedPreferred);

    return looseMatch ?? statusValues[0];
  };

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

    const subscriptionData: any = {
      orgId,
      tier,
      planCode,
      provider,
      status: statusValue,
      upfrontFeePaid: (upfrontFeeAmount / 100).toFixed(2),
      upfrontFeeCurrency,
      monthlyAmount: (monthlyAmount / 100).toFixed(2),
      monthlyCurrency,
      trialStartDate,
      trialEndDate,
      upfrontFeeCredited: false,
    };

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
      const insertValues: ReturnType<typeof sql>[] = [];

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

      const providerValue = subscriptionColumns.has('provider')
        ? ((inserted.provider as typeof subscriptionData.provider | null) ?? provider)
        : provider;
      const statusInserted = subscriptionColumns.has('status')
        ? ((inserted.status as typeof subscriptionData.status | null) ?? statusValue)
        : statusValue;
      const upfrontFeeCreditedValue = subscriptionColumns.has('upfront_fee_credited')
        ? Boolean(inserted.upfront_fee_credited)
        : subscriptionData.upfrontFeeCredited;
      const monthlyAmountValue = subscriptionColumns.has('monthly_amount')
        ? ((inserted.monthly_amount as typeof subscriptionData.monthlyAmount | null) ?? subscriptionData.monthlyAmount)
        : subscriptionData.monthlyAmount;
      const trialStartValue = subscriptionColumns.has('trial_start_date')
        ? ((inserted.trial_start_date as Date | null) ?? trialStartDate)
        : trialStartDate;
      const trialEndValue = subscriptionColumns.has('trial_end_date')
        ? ((inserted.trial_end_date as Date | null) ?? trialEndDate)
        : trialEndDate;
      const nextBillingValue = subscriptionColumns.has('next_billing_date')
        ? ((inserted.next_billing_date as Date | null) ?? null)
        : null;
      const createdAtValue = subscriptionColumns.has('created_at')
        ? ((inserted.created_at as Date | null) ?? trialStartValue)
        : trialStartValue;
      const updatedAtValue = subscriptionColumns.has('updated_at')
        ? ((inserted.updated_at as Date | null) ?? trialStartValue)
        : trialStartValue;
      const autopayEnabledValue = subscriptionColumns.has('autopay_enabled')
        ? Boolean(inserted.autopay_enabled)
        : false;
      const autopayProviderValue = subscriptionColumns.has('autopay_provider')
        ? ((inserted.autopay_provider as string | null) ?? null)
        : null;
      const autopayReferenceValue = subscriptionColumns.has('autopay_reference')
        ? ((inserted.autopay_reference as string | null) ?? null)
        : null;
      const autopayConfiguredAtValue = subscriptionColumns.has('autopay_configured_at')
        ? ((inserted.autopay_configured_at as Date | null) ?? null)
        : null;
      const autopayLastStatusValue = subscriptionColumns.has('autopay_last_status')
        ? ((inserted.autopay_last_status as string | null) ?? null)
        : null;
      const trialReminder7Value = subscriptionColumns.has('trial_reminder_7_sent_at')
        ? ((inserted.trial_reminder_7_sent_at as Date | null) ?? null)
        : null;
      const trialReminder3Value = subscriptionColumns.has('trial_reminder_3_sent_at')
        ? ((inserted.trial_reminder_3_sent_at as Date | null) ?? null)
        : null;

      subscription = {
        id: inserted.id as string,
        orgId: (inserted.org_id as string) ?? orgId,
        userId: subscriptionColumns.has('user_id') ? ((inserted.user_id as string | null) ?? null) : null,
        tier: (inserted.tier as string) ?? tier,
        planCode: (inserted.plan_code as string) ?? planCode,
        provider: providerValue,
        status: statusInserted,
        upfrontFeePaid: (inserted.upfront_fee_paid as typeof subscriptionData.upfrontFeePaid) ?? subscriptionData.upfrontFeePaid,
        upfrontFeeCurrency: (inserted.upfront_fee_currency as string) ?? upfrontFeeCurrency,
        monthlyAmount: monthlyAmountValue,
        monthlyCurrency: (inserted.monthly_currency as string) ?? monthlyCurrency,
        trialStartDate: trialStartValue,
        trialEndDate: trialEndValue,
        nextBillingDate: nextBillingValue,
        upfrontFeeCredited: upfrontFeeCreditedValue,
        autopayEnabled: autopayEnabledValue,
        autopayProvider: autopayProviderValue,
        autopayReference: autopayReferenceValue,
        autopayConfiguredAt: autopayConfiguredAtValue,
        autopayLastStatus: autopayLastStatusValue,
        trialReminder7SentAt: trialReminder7Value,
        trialReminder3SentAt: trialReminder3Value,
        createdAt: createdAtValue,
        updatedAt: updatedAtValue,
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
    const supportsUserIdColumn = await this.ensureSubscriptionUserIdCapability();

    if (supportsUserIdColumn) {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      return subscription;
    }

    const [userRow] = await db
      .select({ subscriptionId: users.subscriptionId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow?.subscriptionId) {
      logger.warn('Subscription lookup skipped: subscriptions.user_id column missing and user has no subscriptionId', {
        userId,
      });
      return undefined;
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, userRow.subscriptionId))
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

export class InvalidPlanChangeError extends Error {
  public code: 'STORE_LIMIT_EXCEEDED' | 'INVALID_PLAN' | 'UNSUPPORTED_TIER' | 'SUBSCRIPTION_NOT_FOUND' | 'SUBSCRIPTION_MISMATCH';
  public status: number;

  constructor(
    message: string,
    code: 'STORE_LIMIT_EXCEEDED' | 'INVALID_PLAN' | 'UNSUPPORTED_TIER' | 'SUBSCRIPTION_NOT_FOUND' | 'SUBSCRIPTION_MISMATCH',
    status: number = 400
  ) {
    super(message);
    this.name = 'InvalidPlanChangeError';
    this.code = code;
    this.status = status;
  }
}
