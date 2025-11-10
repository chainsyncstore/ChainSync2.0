import axios from "axios";
import { and, eq, isNull, isNotNull, lt, lte, or, sql as dsql } from "drizzle-orm";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  dunningEvents,
  inventory,
  organizations,
  subscriptionPayments,
  stockAlerts,
  subscriptions,
  users
} from "@shared/prd-schema";
import { db } from "../db";
import { pool } from "../db";
import { generateTrialPaymentReminderEmail, sendEmail } from "../email";
import { PRICING_TIERS } from "../lib/constants";
import { logger } from "../lib/logger";
import { PaymentService } from "../payment/service";

async function runCleanupOnce(): Promise<void> {
	try {
		const client = await pool.connect();
		try {
			const start = Date.now();
			const result = await client.query<{ cleanup_abandoned_signups: number }>(
				"SELECT cleanup_abandoned_signups()"
			);
			const deletedCount = (result.rows?.[0] as any)?.cleanup_abandoned_signups ?? 0;
			logger.info("Abandoned signup cleanup completed", {
				deletedCount,
				durationMs: Date.now() - start,
			});
		} finally {
			client.release();
		}
	} catch (error) {
		logger.error("Abandoned signup cleanup failed", {}, error as Error);
	}
}

function msUntilNext(hourUtc: number, minute: number = 0, second: number = 0): number {
	const now = new Date();
	const next = new Date(now);
	next.setUTCDate(now.getUTCDate());
	next.setUTCHours(hourUtc, minute, second, 0);
	if (next.getTime() <= now.getTime()) {
		next.setUTCDate(next.getUTCDate() + 1);
	}
	return next.getTime() - now.getTime();
}

export function scheduleAbandonedSignupCleanup(): void {
	const enabled = process.env.CLEANUP_ABANDONED_SIGNUPS !== "false";
	if (!enabled) {
		logger.info("Abandoned signup cleanup scheduler disabled via env");
		return;
	}

	// Default schedule: daily at 03:00 UTC
	const hourUtc = Number(process.env.CLEANUP_ABANDONED_SIGNUPS_HOUR_UTC ?? 3);

	const scheduleNext = () => {
		const delay = msUntilNext(hourUtc);
		logger.info("Scheduling abandoned signup cleanup", { runInMs: delay });
		setTimeout(async () => {
			await runCleanupOnce();
			// After first run at the scheduled time, run every 24h
			setInterval(runCleanupOnce, 24 * 60 * 60 * 1000);
		}, delay);
	};

	scheduleNext();
}

export async function runAbandonedSignupCleanupNow(): Promise<void> {
	await runCleanupOnce();
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const trialDebugLogPath = path.join(process.cwd(), 'test-results', 'trial-expiration.job.log');

async function appendTrialJobLog(label: string, payload: unknown) {
	if (process.env.NODE_ENV !== 'test') {
		return;
	}
	try {
		await mkdir(path.dirname(trialDebugLogPath), { recursive: true });
		const entry = `${new Date().toISOString()} [${label}]\n${JSON.stringify(payload, null, 2)}\n\n`;
		await appendFile(trialDebugLogPath, entry, 'utf8');
	} catch (error) {
		logger.warn('Failed to write trial job debug log', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function runTrialReminderScan(): Promise<void> {
	const now = new Date();

	try {
		const candidates = await db
			.select({
				subscription: subscriptions,
				user: users,
				organization: organizations,
			})
			.from(subscriptions)
			.leftJoin(users, eq(users.id, subscriptions.userId))
			.innerJoin(organizations, eq(organizations.id, subscriptions.orgId))
			.where(
				and(
					eq(subscriptions.status as any, 'TRIAL' as any),
					or(
						eq(subscriptions.autopayEnabled, false),
						isNull(subscriptions.autopayReference)
					)
				)
			);

		for (const row of candidates) {
			const { subscription, user, organization } = row;
			if (!subscription?.trialEndDate || !user?.email) continue;

			const trialEnd = new Date(subscription.trialEndDate as unknown as string);
			const diffMs = trialEnd.getTime() - now.getTime();
			if (diffMs <= 0) continue;
			const daysRemaining = Math.ceil(diffMs / ONE_DAY_MS);
			if (daysRemaining !== 7 && daysRemaining !== 3) continue;

			if (daysRemaining === 7 && subscription.trialReminder7SentAt) continue;
			if (daysRemaining === 3 && subscription.trialReminder3SentAt) continue;

			const displayName = organization?.name || user?.email || organization?.billingEmail || 'there';
			try {
				const emailOptions = generateTrialPaymentReminderEmail(
					user.email,
					displayName,
					organization?.name,
					daysRemaining,
					trialEnd,
					undefined,
					process.env.SUPPORT_EMAIL
				);
				const sent = await sendEmail(emailOptions);
				if (!sent) {
					logger.warn('Trial reminder email failed to send', {
						subscriptionId: subscription.id,
						email: user.email,
						daysRemaining,
					});
					continue;
				}

				await db
					.update(subscriptions)
					.set({
						[daysRemaining === 7 ? 'trialReminder7SentAt' : 'trialReminder3SentAt']: new Date(),
						updatedAt: new Date(),
					} as any)
					.where(eq(subscriptions.id, subscription.id));
				logger.info('Trial reminder email sent', {
					subscriptionId: subscription.id,
					email: user.email,
					daysRemaining,
				});
			} catch (error) {
				logger.error('Trial reminder processing failed', {
					subscriptionId: subscription.id,
					email: user.email,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	} catch (error) {
		logger.error('Trial reminder scan failed', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function runTrialReminderScanNow(): Promise<void> {
	await runTrialReminderScan();
}

export function scheduleTrialReminders(): void {
	const enabled = process.env.TRIAL_REMINDER_SCHEDULE !== "false";
	if (!enabled) {
		logger.info("Trial reminder scheduler disabled via env");
		return;
	}
	const hourUtc = Number(process.env.TRIAL_REMINDER_HOUR_UTC ?? 9);
	const scheduleNext = () => {
		const delay = msUntilNextHourUtc(hourUtc);
		logger.info("Scheduling trial reminder scan", { runInMs: delay });
		setTimeout(async () => {
			await runTrialReminderScan();
			setInterval(runTrialReminderScan, ONE_DAY_MS);
		}, delay);
	};
	scheduleNext();
}

async function runTrialExpirationBillingOnce(paymentService?: PaymentService): Promise<void> {
	const now = new Date();
	let service = paymentService;

	if (!service) {
		if (process.env.NODE_ENV === 'test') {
			throw new Error('runTrialExpirationBillingOnce requires a PaymentService instance in test environment');
		}
		service = new PaymentService();
	}

	try {
		const dueSubscriptions = await db
			.select()
			.from(subscriptions)
			.where(
				and(
					eq(subscriptions.autopayEnabled, true as any),
					isNotNull(subscriptions.autopayReference),
					or(
						and(
							eq(subscriptions.status as any, 'TRIAL' as any),
							isNotNull(subscriptions.trialEndDate),
							lte(subscriptions.trialEndDate as any, now)
						),
						and(
							eq(subscriptions.status as any, 'ACTIVE' as any),
							isNotNull(subscriptions.nextBillingDate),
							lte(subscriptions.nextBillingDate as any, now)
						)
					)
				)
			);

		await appendTrialJobLog('dueSubscriptions snapshot', dueSubscriptions);

		for (const subscription of dueSubscriptions) {
			const subscriptionId = subscription.id as string;
			const orgId = subscription.orgId as string;
			const [organization] = await db
				.select()
				.from(organizations)
				.where(eq(organizations.id, orgId as any));
			if (!organization) {
				logger.warn('Subscription missing organization during billing run', {
					subscriptionId,
					orgId,
				});
				continue;
			}
			const tierCandidate = String(subscription.planCode ?? 'basic').toLowerCase();
			const tierKey = (['basic', 'pro', 'enterprise'].includes(tierCandidate) ? tierCandidate : 'basic') as keyof typeof PRICING_TIERS;
			const tierPricing = PRICING_TIERS[tierKey];
			const currency = String(organization.currency ?? 'NGN').toUpperCase();
			const autopayProvider = String(subscription.autopayProvider ?? subscription.provider ?? 'PAYSTACK').toUpperCase() as 'PAYSTACK' | 'FLW';
			const autopayReference = subscription.autopayReference as string | null;
			let email: string | undefined;
			const subscriptionUserId = subscription.userId as string | null | undefined;
			if (subscriptionUserId) {
				const [userRecord] = await db
					.select()
					.from(users)
					.where(eq(users.id, subscriptionUserId as any));
				email = userRecord?.email as string | undefined;
			}
			const isTrial = String(subscription.status).toUpperCase() === 'TRIAL';
			const billingDueAt = isTrial
				? (subscription.trialEndDate ? new Date(subscription.trialEndDate as unknown as string) : now)
				: (subscription.nextBillingDate ? new Date(subscription.nextBillingDate as unknown as string) : now);

			const markPastDue = async (status: 'failed' | 'missing_method') => {
				await db
					.update(subscriptions)
					.set({
						status: 'PAST_DUE' as any,
						autopayLastStatus: status,
						updatedAt: new Date(),
					} as any)
					.where(eq(subscriptions.id, subscriptionId as any));
				await db
					.update(organizations)
					.set({
						isActive: false as any,
						lockedUntil: new Date(),
					} as any)
					.where(eq(organizations.id, orgId as any));
				logger.warn('Marked subscription past due', {
					subscriptionId,
					orgId,
					reason: status,
				});
			};

			if (!subscription.autopayEnabled || !autopayReference || !email) {
				await markPastDue('missing_method');
				continue;
			}

			await db
				.update(subscriptions)
				.set({
					autopayLastStatus: 'pending_charge',
					updatedAt: new Date(),
				} as any)
				.where(eq(subscriptions.id, subscriptionId as any));

			let chargeSuccess = false;
			let chargeReference: string | undefined;
			let chargeRaw: any;
			let chargeMessage: string | undefined;

			try {
				if (autopayProvider === 'PAYSTACK') {
					const amountMinor = currency === 'NGN' ? tierPricing.ngn : tierPricing.usd;
					const reference = service.generateReference('paystack');
					const chargeResult = await service.chargePaystackAuthorization(
						autopayReference,
						email,
						amountMinor,
						currency,
						reference,
						{ subscriptionId, orgId }
					);
					chargeSuccess = chargeResult.success;
					chargeReference = chargeResult.reference ?? reference;
					chargeRaw = chargeResult.raw;
					chargeMessage = chargeResult.message;
				} else {
					const amountMajor = currency === 'NGN' ? tierPricing.ngn / 100 : tierPricing.usd / 100;
					const reference = service.generateReference('flutterwave');
					const chargeResult = await service.chargeFlutterwaveToken(
						autopayReference,
						email,
						amountMajor,
						currency,
						reference,
						{ subscriptionId, orgId }
					);
					chargeSuccess = chargeResult.success;
					chargeReference = chargeResult.reference ?? reference;
					chargeRaw = chargeResult.raw;
					chargeMessage = chargeResult.message;
				}
			} catch (error) {
				chargeSuccess = false;
				chargeMessage = error instanceof Error ? error.message : String(error);
				logger.error('Autopay charge attempt threw', {
					subscriptionId,
					orgId,
					error: chargeMessage,
				});
			}

			const amountDecimal = currency === 'NGN'
				? (tierPricing.ngn / 100).toFixed(2)
				: (tierPricing.usd / 100).toFixed(2);

			try {
				await db.insert(subscriptionPayments).values({
					orgId: orgId as any,
					provider: autopayProvider as any,
					planCode: subscription.planCode as any ?? tierKey,
					externalSubId: subscription.externalSubId as any,
					externalInvoiceId: chargeReference as any,
					reference: chargeReference as any,
					amount: amountDecimal as any,
					currency,
					status: (chargeSuccess ? 'completed' : 'failed') as any,
					eventType: 'auto_renew' as any,
					occurredAt: new Date() as any,
					raw: chargeRaw ?? { message: chargeMessage } as any,
				} as any);
			} catch (error) {
				logger.warn('Failed to record autopay charge', {
					subscriptionId,
					orgId,
					error: error instanceof Error ? error.message : String(error),
				});
			}

			if (chargeSuccess) {
				const nextBillingDateBase = billingDueAt ?? now;
				const nextBillingDate = new Date(nextBillingDateBase.getTime() + 30 * ONE_DAY_MS);
				await db
					.update(subscriptions)
					.set({
						status: 'ACTIVE' as any,
						autopayLastStatus: 'charged',
						nextBillingDate,
						updatedAt: new Date(),
					} as any)
					.where(eq(subscriptions.id, subscriptionId as any));
				await db
					.update(organizations)
					.set({
						isActive: true as any,
						lockedUntil: null,
					} as any)
					.where(eq(organizations.id, orgId as any));
				logger.info('Subscription renewed automatically', {
					subscriptionId,
					orgId,
					reference: chargeReference,
				});
			} else {
				await markPastDue('failed');
			}
		}
	} catch (error) {
		await appendTrialJobLog('trial expiration billing error', {
			error: error instanceof Error ? error.message : String(error),
		});
		logger.error('Trial expiration billing run failed', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function runTrialExpirationBillingNow(paymentService?: PaymentService): Promise<void> {
	await runTrialExpirationBillingOnce(paymentService);
}

export function scheduleTrialExpirationBilling(): void {
	const enabled = process.env.TRIAL_BILLING_SCHEDULE !== "false";
	if (!enabled) {
		logger.info("Trial expiration billing scheduler disabled via env");
		return;
	}
	const hourUtc = Number(process.env.TRIAL_BILLING_HOUR_UTC ?? 6);
	const scheduleNext = () => {
		const delay = msUntilNextHourUtc(hourUtc);
		logger.info("Scheduling trial expiration billing run", { runInMs: delay });
		setTimeout(async () => {
			await runTrialExpirationBillingOnce();
			setInterval(runTrialExpirationBillingOnce, ONE_DAY_MS);
		}, delay);
	};
	scheduleNext();
}


// Nightly low stock alert generator
async function runLowStockAlertOnce(): Promise<void> {
    try {
        const start = Date.now();
        const rows = await db.select().from(inventory).where(lt(inventory.quantity, inventory.reorderLevel));
        let created = 0;
        for (const row of rows as any[]) {
            const existing = await db.select().from(stockAlerts)
                .where(
                    and(
                        eq(stockAlerts.storeId, row.storeId),
                        eq(stockAlerts.productId, row.productId),
                        eq(stockAlerts.resolved, false)
                    )
                );
            if (existing.length === 0) {
                await db.insert(stockAlerts).values({
                    storeId: row.storeId,
                    productId: row.productId,
                    currentQty: row.quantity,
                    reorderLevel: row.reorderLevel,
                } as any);
                created++;
            }
        }
        logger.info("Low stock alert scan completed", { created, durationMs: Date.now() - start });
    } catch (error) {
        logger.error("Low stock alert scan failed", {}, error as Error);
    }
}

function msUntilNextHourUtc(hourUtc: number): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate());
    next.setUTCHours(hourUtc, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
}

export function scheduleNightlyLowStockAlerts(): void {
    const enabled = process.env.LOW_STOCK_ALERTS_SCHEDULE !== "false";
    if (!enabled) {
        logger.info("Low stock alerts scheduler disabled via env");
        return;
    }
    const hourUtc = Number(process.env.LOW_STOCK_ALERTS_HOUR_UTC ?? 2);
    const scheduleNext = () => {
        const delay = msUntilNextHourUtc(hourUtc);
        logger.info("Scheduling nightly low stock alert scan", { runInMs: delay });
        setTimeout(async () => {
            await runLowStockAlertOnce();
            setInterval(runLowStockAlertOnce, 24 * 60 * 60 * 1000);
        }, delay);
    };
    scheduleNext();
}

// Provider reconciliation: verify active subscriptions are current and backfill missing payments
async function runSubscriptionReconciliationOnce(): Promise<void> {
    try {
        const activeSubs = await db.select().from(subscriptions).where(eq(subscriptions.status as any, 'ACTIVE' as any));
        for (const sub of activeSubs) {
            try {
                if (String(sub.provider) === 'PAYSTACK') {
                    // Fetch subscription info (Paystack subscription code in externalSubId or use customer_code)
                    const subCode = sub.externalSubId;
                    const customerCode = sub.externalCustomerId;
                    if (subCode) {
                        const subResp = await axios.get(`https://api.paystack.co/subscription/${encodeURIComponent(subCode)}`, {
                            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
                        });
                        const sdata = subResp.data?.data;
                        // Update current period end if available
                        const nextPaymentDate = sdata?.next_payment_date ? new Date(sdata.next_payment_date) : undefined;
                        if (nextPaymentDate) {
                            await db.execute(dsql`UPDATE subscriptions SET current_period_end = ${nextPaymentDate} WHERE id = ${sub.id}`);
                        }
                    }
                    // Fetch recent transactions for this customer to backfill payments
                    if (customerCode) {
                        const txResp = await axios.get(`https://api.paystack.co/transaction?customer=${encodeURIComponent(customerCode)}&perPage=50`, {
                            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
                        });
                        const items: any[] = txResp.data?.data || [];
                        for (const it of items) {
                            const status = it.status; // success, failed
                            const amount = (Number(it.amount || 0) / 100).toFixed(2);
                            const currency = it.currency || 'NGN';
                            const reference = it.reference || it.id;
                            const invoiceId = it.id;
                            try {
                                await db.insert(subscriptionPayments).values({
                                    orgId: sub.orgId as any,
                                    provider: 'PAYSTACK' as any,
                                    planCode: sub.planCode as any,
                                    externalSubId: sub.externalSubId as any,
                                    externalInvoiceId: String(invoiceId),
                                    reference: String(reference),
                                    amount: amount as any,
                                    currency,
                                    status,
                                    eventType: 'reconciliation',
                                    raw: it as any,
                                } as any);
                            } catch (insertError) {
                                logger.warn('Failed to persist Paystack reconciliation item', {
                                    subscriptionId: sub.id,
                                    invoiceId,
                                    reference,
                                    error: insertError instanceof Error ? insertError.message : String(insertError),
                                });
                            }
                        }
                    }
                } else if (String(sub.provider) === 'FLW') {
                    // Flutterwave: list transactions filtered by payment plan or customer
                    const planId = sub.externalSubId;
                    if (planId) {
                        // There isn't a single endpoint for invoices per plan; list transactions and filter by meta/orgId
                        const txResp = await axios.get('https://api.flutterwave.com/v3/transactions', {
                            headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }
                        });
                        const items: any[] = txResp.data?.data || [];
                        for (const it of items) {
                            // Backfill only those matching our org via meta (if present)
                            const metaOrg = it?.meta?.orgId || it?.meta?.org_id;
                            if (metaOrg && String(metaOrg) !== String(sub.orgId)) continue;
                            const status = it.status; // successful, failed
                            const amount = Number(it.amount || 0).toFixed(2); // major units
                            const currency = it.currency || 'USD';
                            const reference = it.tx_ref || it.id;
                            const invoiceId = it.id;
                            try {
                                await db.insert(subscriptionPayments).values({
                                    orgId: sub.orgId as any,
                                    provider: 'FLW' as any,
                                    planCode: sub.planCode as any,
                                    externalSubId: String(planId) as any,
                                    externalInvoiceId: String(invoiceId),
                                    reference: String(reference),
                                    amount: amount as any,
                                    currency,
                                    status,
                                    eventType: 'reconciliation',
                                    raw: it as any,
                                } as any);
                            } catch (insertError) {
                                logger.warn('Failed to persist Flutterwave reconciliation item', {
                                    subscriptionId: sub.id,
                                    invoiceId,
                                    reference,
                                    error: insertError instanceof Error ? insertError.message : String(insertError),
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error("Reconciliation error for sub", { subId: sub.id, err });
            }
        }
    } catch (err) {
        logger.error("Subscription reconciliation error", { err });
    }
}

export function scheduleSubscriptionReconciliation(): void {
    const enabled = process.env.SUBSCRIPTION_RECONCILIATION_SCHEDULE !== "false";
    if (!enabled) {
        logger.info("Subscription reconciliation scheduler disabled via env");
        return;
    }
    const hourUtc = Number(process.env.SUBSCRIPTION_RECONCILIATION_HOUR_UTC ?? 4);
    const scheduleNext = () => {
        const delay = msUntilNextHourUtc(hourUtc);
        logger.info("Scheduling daily subscription reconciliation", { runInMs: delay });
        setTimeout(async () => {
            await runSubscriptionReconciliationOnce();
            setInterval(runSubscriptionReconciliationOnce, 24 * 60 * 60 * 1000);
        }, delay);
    };
    scheduleNext();
}

// Simple dunning scheduler: send escalating notices and lock after grace
async function runDunningOnce(): Promise<void> {
    try {
        const pastDueSubs = await db.select().from(subscriptions).where(eq(subscriptions.status as any, 'PAST_DUE' as any));
        for (const sub of pastDueSubs) {
            const previousAttempts = await db.select().from(dunningEvents).where(eq(dunningEvents.subscriptionId as any, sub.id as any));
            const attempt = (previousAttempts?.length || 0) + 1;
            const nextAttemptDelayDays = Math.min(7, attempt); // progressive but bounded
            const nextAttemptAt = new Date(Date.now() + nextAttemptDelayDays * 24 * 60 * 60 * 1000);
            const org = (await db.select().from(organizations).where(eq(organizations.id as any, sub.orgId as any)))[0] as any;
            const to = org?.billingEmail || process.env.BILLING_FALLBACK_EMAIL || 'billing@chainsync.com';
            if (org?.id) {
                // In a real system, look up billing contact email for the org
                await sendEmail({
                    to,
                    subject: `Payment issue with your ChainSync subscription (attempt ${attempt})`,
                    html: `<p>Your subscription is past due. Please update your payment method to avoid service interruption.</p>`,
                    text: `Your subscription is past due. Please update your payment method.`
                });
            }
            await db.insert(dunningEvents).values({
                orgId: sub.orgId as any,
                subscriptionId: sub.id as any,
                attempt,
                status: 'sent' as any,
                nextAttemptAt: nextAttemptAt as any,
            } as any);
        }
    } catch (err) {
        logger.error("Dunning job error", { err });
    }
}

export function scheduleDunning(): void {
    const enabled = process.env.DUNNING_SCHEDULE !== "false";
    if (!enabled) {
        logger.info("Dunning scheduler disabled via env");
        return;
    }
    const hourUtc = Number(process.env.DUNNING_HOUR_UTC ?? 5);
    const scheduleNext = () => {
        const delay = msUntilNextHourUtc(hourUtc);
        logger.info("Scheduling daily dunning run", { runInMs: delay });
        setTimeout(async () => {
            await runDunningOnce();
            setInterval(runDunningOnce, 24 * 60 * 60 * 1000);
        }, delay);
    };
    scheduleNext();
}
