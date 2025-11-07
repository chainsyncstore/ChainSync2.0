import { eq, and, lte } from 'drizzle-orm';

import { subscriptions, subscriptionPayments, users, type InsertSubscription, type InsertSubscriptionPayment } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';

export class SubscriptionService {
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

    const subscriptionData: InsertSubscription = {
      userId,
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
    };

    logger.info('createSubscription:start', { userId, tier, upfrontFeeAmount, monthlyAmount });

    const existingSubscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let subscription: typeof subscriptions.$inferSelect;

    if (existingSubscription.length > 0) {
      [subscription] = existingSubscription;
      logger.info('createSubscription:reuse', { userId, subscriptionId: subscription.id });
    } else {
      [subscription] = await db
        .insert(subscriptions)
        .values(subscriptionData as unknown as typeof subscriptions.$inferInsert)
        .returning();
      logger.info('createSubscription:insert', { userId, subscriptionId: subscription.id });
    }

    // Update user with subscription ID
    await db.update(users)
      .set({ subscriptionId: subscription.id } as any)
      .where(eq(users.id, userId));

    logger.info('createSubscription:complete', { userId, subscriptionId: subscription.id });

    return subscription;
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
    const paymentData: InsertSubscriptionPayment = {
      subscriptionId,
      paymentReference,
      amount: (amount / 100).toFixed(2),
      currency,
      paymentType,
      status: status.toUpperCase() as any,
      provider,
      metadata,
    };

    const [payment] = await db.insert(subscriptionPayments).values(paymentData as unknown as typeof subscriptionPayments.$inferInsert).returning();
    return payment;
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
    const [subscription] = await db
      .update(subscriptions)
      .set({ 
        status: normalizedStatus as any,
        updatedAt: new Date()
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return subscription;
  }

  /**
   * Mark upfront fee as credited (when first monthly billing occurs)
   */
  async markUpfrontFeeCredited(subscriptionId: string) {
    const [subscription] = await db
      .update(subscriptions)
      .set({ 
        upfrontFeeCredited: true as any,
        updatedAt: new Date()
      } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return subscription;
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
    const [updated] = await db.update(subscriptions)
      .set({ tier: newTier, updatedAt: new Date() } as any)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    return { changed: true, oldTier: oldSub.tier, newTier: updated.tier, subscription: updated };
  }
}
