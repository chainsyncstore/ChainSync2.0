import { pool } from "../db";
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


