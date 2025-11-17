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
  users,
  scheduledReports,
  userRoles,
  stores,
} from "@shared/schema";
import { db } from "../db";
import { pool } from "../db";
import { generateTrialPaymentReminderEmail, sendEmail } from "../email";
import { PRICING_TIERS } from "../lib/constants";
import { logger } from "../lib/logger";
import { PaymentService } from "../payment/service";

const ABANDONED_SIGNUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

async function cleanupAbandonedSignupsOlderThanOneHour(): Promise<number> {
	const cutoff = new Date(Date.now() - ABANDONED_SIGNUP_MAX_AGE_MS);
	const abandonedUsers = await db
		.select({
			id: users.id,
			orgId: users.orgId,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(
			and(
				lt(users.createdAt, cutoff),
				or(isNull(users.signupCompleted), eq(users.signupCompleted, false as any)),
				or(isNull(users.signupCompletedAt), lt(users.signupCompletedAt, cutoff)),
				or(isNull(users.isActive), eq(users.isActive, false as any))
			)
		);

	let deleted = 0;
	for (const abandoned of abandonedUsers) {
		await db.transaction(async (tx) => {
			if (abandoned.orgId) {
				await tx.delete(userRoles).where(eq(userRoles.orgId, abandoned.orgId));
				await tx.delete(stores).where(eq(stores.orgId, abandoned.orgId));
				await tx.delete(subscriptions).where(eq(subscriptions.orgId, abandoned.orgId));
				await tx.delete(organizations).where(eq(organizations.id, abandoned.orgId));
			}
			await tx.delete(users).where(eq(users.id, abandoned.id));
		});
		deleted += 1;
	}

	return deleted;
}

let skipDbCleanupProcedure = false;

async function runCleanupOnce(): Promise<void> {
	try {
		if (!skipDbCleanupProcedure) {
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
		}
	} catch (error) {
		const pgCode = (error as any)?.code;
		const missingProcedure = pgCode === "42883" || (error as Error)?.message?.includes("cleanup_abandoned_signups");
		if (missingProcedure) {
			if (!skipDbCleanupProcedure) {
				skipDbCleanupProcedure = true;
				logger.warn("cleanup_abandoned_signups() function missing; falling back to manual cleanup only.");
			}
		} else {
			logger.error("Abandoned signup cleanup failed", {}, error as Error);
		}
	}

	try {
		const manualDeleted = await cleanupAbandonedSignupsOlderThanOneHour();
		if (manualDeleted > 0) {
			logger.info("Manual abandoned signup cleanup removed users", { count: manualDeleted });
		}
	} catch (error) {
		logger.error("Manual abandoned signup cleanup failed", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function scheduleAbandonedSignupCleanup(): void {
	const enabled = process.env.CLEANUP_ABANDONED_SIGNUPS !== "false";
	if (!enabled) {
		logger.info("Abandoned signup cleanup scheduler disabled via env");
		return;
	}

	const intervalMinutesEnv = Number(process.env.CLEANUP_ABANDONED_SIGNUPS_INTERVAL_MINUTES ?? 60);
	const intervalMinutes = Number.isFinite(intervalMinutesEnv) && intervalMinutesEnv > 0 ? intervalMinutesEnv : 60;
	const intervalMs = intervalMinutes * 60 * 1000;
	const initialDelayMsEnv = Number(process.env.CLEANUP_ABANDONED_SIGNUPS_INITIAL_DELAY_MS ?? 30_000);
	const initialDelayMs = Number.isFinite(initialDelayMsEnv) && initialDelayMsEnv >= 0 ? initialDelayMsEnv : 30_000;

	logger.info("Scheduling abandoned signup cleanup loop", {
		intervalMinutes,
		initialDelayMs,
	});

	setTimeout(() => {
		void runCleanupOnce();
		setInterval(() => {
			void runCleanupOnce();
		}, intervalMs);
	}, initialDelayMs);
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

async function runScheduledReportsOnce(): Promise<void> {
    const now = new Date();
    try {
        const schedules = await db
            .select()
            .from(scheduledReports)
            .where(eq(scheduledReports.isActive as any, true as any));

        for (const schedule of schedules as any[]) {
            const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt as string) : null;
            const interval = String(schedule.interval || "daily").toLowerCase();

            let due = false;
            if (!lastRunAt) {
                due = true;
            } else {
                const diffMs = now.getTime() - lastRunAt.getTime();
                const diffDays = diffMs / ONE_DAY_MS;
                if (interval === "daily" && diffDays >= 1) due = true;
                else if (interval === "weekly" && diffDays >= 7) due = true;
                else if (interval === "monthly" && diffDays >= 28) due = true;
            }
            if (!due) continue;

            const params = (schedule.params || {}) as any;
            const windowKey = String(params.window || "last_7_days").toLowerCase();
            const bucketInterval = String(params.interval || "day").toLowerCase(); // day|week|month

            let dateFrom: Date;
            const dateTo = now;
            if (windowKey === "last_30_days") {
                dateFrom = new Date(now.getTime() - 30 * ONE_DAY_MS);
            } else {
                dateFrom = new Date(now.getTime() - 7 * ONE_DAY_MS);
            }

            const truncUnit = bucketInterval === "month" ? "month" : bucketInterval === "week" ? "week" : "day";
            const where: any[] = [];
            if (schedule.orgId) where.push(dsql`org_id = ${schedule.orgId}`);
            if (schedule.storeId) where.push(dsql`store_id = ${schedule.storeId}`);
            where.push(dsql`occurred_at >= ${dateFrom}`);
            where.push(dsql`occurred_at <= ${dateTo}`);

            const rows = await db.execute(dsql`SELECT 
              date_trunc(${dsql.raw(`'${truncUnit}'`)}, occurred_at) as bucket,
              SUM(total::numeric) as revenue,
              SUM(discount::numeric) as discount,
              SUM(tax::numeric) as tax,
              COUNT(*) as transactions
              FROM sales
              ${where.length ? dsql`WHERE ${dsql.join(where, dsql` AND `)}` : dsql``}
              GROUP BY 1
              ORDER BY 1 ASC`);

            let csv = "date,revenue,discount,tax,transactions\n";
            for (const r of (rows as any).rows) {
                const line = `${new Date(r.bucket).toISOString()},${r.revenue},${r.discount},${r.tax},${r.transactions}\n`;
                csv += line;
            }

            if (!csv || csv === "date,revenue,discount,tax,transactions\n") continue;

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id as any, schedule.userId as any))
                .limit(1);
            const toEmail = (user as any)?.email as string | undefined;
            if (!toEmail) {
                logger.warn("Scheduled report has no valid recipient email", { scheduleId: schedule.id });
                continue;
            }

            const filename = `analytics_scheduled_${now.toISOString().substring(0, 10)}.csv`;
            try {
                const sent = await sendEmail({
                    to: toEmail,
                    subject: "Your scheduled ChainSync analytics report",
                    html: `<p>Your scheduled analytics CSV report is attached as <strong>${filename}</strong>.</p>`,
                    text: `Your scheduled analytics CSV report is attached as ${filename}.`,
                    attachments: [
                        {
                            filename,
                            content: csv,
                            contentType: "text/csv",
                        },
                    ],
                });
                if (!sent) {
                    logger.warn("Failed to send scheduled analytics report email", { scheduleId: schedule.id, toEmail });
                    continue;
                }
            } catch (error) {
                logger.error("Error sending scheduled analytics report email", {
                    scheduleId: schedule.id,
                    toEmail,
                    error: error instanceof Error ? error.message : String(error),
                });
                continue;
            }

            try {
                await db
                    .update(scheduledReports as any)
                    .set({ lastRunAt: now as any })
                    .where(eq(scheduledReports.id as any, schedule.id as any));
            } catch (error) {
                logger.warn("Failed to update lastRunAt for scheduled report", {
                    scheduleId: schedule.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    } catch (error) {
        logger.error("Scheduled analytics reports job failed", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function runScheduledReportsNow(): Promise<void> {
    await runScheduledReportsOnce();
}

export function scheduleAnalyticsReports(): void {
    const enabled = process.env.ANALYTICS_REPORT_SCHEDULE !== "false";
    if (!enabled) {
        logger.info("Analytics reports scheduler disabled via env");
        return;
    }
    const hourUtc = Number(process.env.ANALYTICS_REPORT_HOUR_UTC ?? 7);
    const scheduleNext = () => {
        const delay = msUntilNextHourUtc(hourUtc);
        logger.info("Scheduling analytics reports job", { runInMs: delay });
        setTimeout(async () => {
            await runScheduledReportsOnce();
            setInterval(runScheduledReportsOnce, ONE_DAY_MS);
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

export async function runSubscriptionReconciliationNow(): Promise<void> {
    await runSubscriptionReconciliationOnce();
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
            setInterval(runSubscriptionReconciliationOnce, ONE_DAY_MS);
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
