import { db } from '../db';
import { subscriptions, subscriptionPayments, users } from '../../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { InsertSubscription, InsertSubscriptionPayment } from '../../shared/schema';

export class SubscriptionService {
  /**
   * Create a new subscription for a user after successful upfront fee payment
   */
  async createSubscription(
    userId: string,
    tier: string,
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
      tier,
      status: 'trial',
      upfrontFeePaid: upfrontFeeAmount / 100, // Convert from cents/kobo to currency units
      upfrontFeeCurrency,
      monthlyAmount: monthlyAmount / 100, // Convert from cents/kobo to currency units
      monthlyCurrency,
      trialStartDate,
      trialEndDate,
      upfrontFeeCredited: false,
    };

    const [subscription] = await db.insert(subscriptions).values(subscriptionData).returning();

    // Update user with subscription ID
    await db.update(users)
      .set({ subscriptionId: subscription.id })
      .where(eq(users.id, userId));

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
      amount: amount / 100, // Convert from cents/kobo to currency units
      currency,
      paymentType,
      status,
      provider,
      metadata,
    };

    const [payment] = await db.insert(subscriptionPayments).values(paymentData).returning();
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
    const [subscription] = await db
      .update(subscriptions)
      .set({ 
        status,
        updatedAt: new Date()
      })
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
        upfrontFeeCredited: true,
        updatedAt: new Date()
      })
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
          eq(subscriptions.status, 'trial'),
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
          eq(subscriptions.status, 'trial'),
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
}
