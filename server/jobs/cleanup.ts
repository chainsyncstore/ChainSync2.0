import { pool } from "../db";
import { logger } from "../lib/logger";
import { db } from "../db";
import { inventory, lowStockAlerts } from "@shared/schema";
import { and, lt, eq } from "drizzle-orm";

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
            const existing = await db.select().from(lowStockAlerts)
                .where(and(eq(lowStockAlerts.storeId, row.storeId), eq(lowStockAlerts.productId, row.productId), eq(lowStockAlerts.isResolved, false)));
            if (existing.length === 0) {
                await db.insert(lowStockAlerts).values({
                    storeId: row.storeId,
                    productId: row.productId,
                    currentStock: row.quantity,
                    minStockLevel: row.reorderLevel,
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
