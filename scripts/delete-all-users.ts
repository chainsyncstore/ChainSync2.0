import { Client } from "pg";

function buildConnectionVariants(original: string): string[] {
	const variants = new Set<string>();
	const add = (s: string) => variants.add(s);
	add(original);

	try {
		const u = new URL(original);
		// Remove channel_binding param if present
		if (u.searchParams.has("channel_binding")) {
			u.searchParams.delete("channel_binding");
			add(u.toString());
		}
		// Fallback to non-pooler host if applicable
		if (u.hostname.includes("-pooler.")) {
			const nonPooler = new URL(u.toString());
			nonPooler.hostname = nonPooler.hostname.replace("-pooler.", ".");
			add(nonPooler.toString());
			// Also add non-pooler + no channel_binding
			if (nonPooler.searchParams.has("channel_binding")) {
				nonPooler.searchParams.delete("channel_binding");
				add(nonPooler.toString());
			}
		}
	} catch {
		// If URL parsing fails, just use the original
	}

	return Array.from(variants);
}

async function connectWithRetries(connectionString: string, maxAttempts = 6): Promise<Client> {
	const candidates = buildConnectionVariants(connectionString);
	let lastError: unknown;
	let attempt = 0;

	while (attempt < maxAttempts) {
		for (const candidate of candidates) {
			try {
				const lowerUrl = candidate.toLowerCase();
				const needsSsl = lowerUrl.includes("sslmode=require") || lowerUrl.includes("neon.tech");
				const client = new Client({
					connectionString: candidate,
					ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
				});
				await client.connect();
				return client;
			} catch (err) {
				lastError = err;
			}
		}

		// Exponential backoff: 0.5s, 1s, 2s, 4s, 8s...
		const delayMs = Math.min(8000, 500 * Math.pow(2, attempt));
		await new Promise((res) => setTimeout(res, delayMs));
		attempt++;
	}

	throw lastError ?? new Error("Failed to connect to database after retries");
}

async function deleteAllUsers(): Promise<void> {
	const connectionString = process.env.DB_URL || process.env.DATABASE_URL;
	if (!connectionString) {
		console.error("ERROR: Missing DB_URL or DATABASE_URL environment variable.");
		process.exit(1);
	}

	const client = await connectWithRetries(connectionString);

	try {
		// Get current count for reporting
		const beforeRes = await client.query<{ count: string }>(
			"SELECT COUNT(*) AS count FROM public.users"
		);
		const beforeCount = parseInt(beforeRes.rows[0]?.count ?? "0", 10);
		console.log(`Users found before delete: ${beforeCount}`);

		await client.query("BEGIN");

		// Create a timestamped backup table in the same schema
		const timestamp = new Date()
			.toISOString()
			.replace(/[-:TZ]/g, "")
			.slice(0, 14); // YYYYMMDDHHMMSS
		const backupTableName = `users_backup_${timestamp}`;

		await client.query(
			`CREATE TABLE public.${backupTableName} AS SELECT * FROM public.users`
		);
		console.log(`Backup created: public.${backupTableName}`);

		// Truncate with CASCADE to handle referencing tables
		await client.query("TRUNCATE TABLE public.users CASCADE");

		const afterRes = await client.query<{ count: string }>(
			"SELECT COUNT(*) AS count FROM public.users"
		);
		const afterCount = parseInt(afterRes.rows[0]?.count ?? "0", 10);

		await client.query("COMMIT");

		console.log(
			`Deleted ${beforeCount} users. Users remaining: ${afterCount}.`
		);
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// ignore rollback errors
		}
		console.error("Failed to delete users:", error);
		process.exitCode = 1;
	} finally {
		await client.end();
	}
}

deleteAllUsers();


