import axios from "axios";
import { and, eq, lt, sql as dsql } from "drizzle-orm";
import { subscriptions, subscriptionPayments, dunningEvents, organizations, inventory, stockAlerts } from "@shared/prd-schema";
import { db } from "../db";
import { pool } from "../db";
import { sendEmail } from "../email";
import { logger } from "../lib/logger";

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
