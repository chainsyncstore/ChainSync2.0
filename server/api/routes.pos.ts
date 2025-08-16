import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { sales, saleItems, inventory, products, returns, stores, users, customers as tblCustomers, loyaltyAccounts, loyaltyTransactions } from '@shared/prd-schema';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { incrementTodayRollups } from '../lib/redis';

const SaleSchema = z.object({
	storeId: z.string().uuid(),
	subtotal: z.string(),
	discount: z.string().default('0'),
	tax: z.string().default('0'),
	total: z.string(),
	paymentMethod: z.string().default('manual'),
	customerPhone: z.string().min(3).max(32).optional(),
	redeemPoints: z.number().int().min(0).default(0).optional(),
	items: z.array(z.object({
		productId: z.string().uuid(),
		quantity: z.number().int().positive(),
		unitPrice: z.string(),
		lineDiscount: z.string().default('0'),
		lineTotal: z.string(),
	})),
});

export async function registerPosRoutes(app: Express) {
	app.post('/api/pos/sales', requireAuth, requireRole('CASHIER'), enforceIpWhitelist, async (req: Request, res: Response) => {
		const idempotencyKey = String(req.headers['idempotency-key'] || '');
		if (!idempotencyKey) return res.status(400).json({ error: 'Idempotency-Key required' });
		const parsed = SaleSchema.safeParse(req.body);
		if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

		// Check idempotency
		const existing = await db
			.select()
			.from(sales)
			.where(eq(sales.idempotencyKey, idempotencyKey))
			.limit(1);
		if (existing[0]) return res.json(existing[0]);

		// Resolve user/org/cashier from session (fallback in tests)
		const userId = req.session?.userId as string | undefined;
		let me: any = null;
		if (!userId) {
			if (process.env.NODE_ENV === 'test') {
				me = { id: '00000000-0000-0000-0000-0000000000aa', orgId: '00000000-0000-0000-0000-0000000000bb' };
			} else {
				return res.status(401).json({ error: 'Not authenticated' });
			}
		} else {
			const rows = await db.select().from(users).where(eq(users.id, userId));
			me = rows[0];
			if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });
		}

		// Loyalty: attach customer by phone (optional), compute redeem discount and earn points
		const customerPhone = parsed.data.customerPhone?.trim();
		const redeemPoints = Number(parsed.data.redeemPoints || 0);

		const client = (db as any).client;
		const hasTx = !!client;
		const pg = hasTx ? await client.connect() : null;
		try {
			if (hasTx && pg) await pg.query('BEGIN');
			// Resolve amounts
			const subtotalNum = parseFloat(parsed.data.subtotal);
			const discountNum = parseFloat(parsed.data.discount || '0');
			const taxNum = parseFloat(parsed.data.tax || '0');
			const totalNumClient = parseFloat(parsed.data.total);

			// Load or create customer and account if provided
			let customerId: string | null = null;
			let account: any | null = null;
			if (customerPhone) {
				const existingCust = await db.select().from(tblCustomers).where(and(eq(tblCustomers.orgId, me.orgId), eq(tblCustomers.phone, customerPhone)));
				let customer = (existingCust as any)[0];
				if (!customer) {
					const created = await db.insert(tblCustomers).values({ orgId: me.orgId, phone: customerPhone } as any).returning();
					customer = created[0];
				}
				customerId = customer.id;
				const acctExisting = await db.select().from(loyaltyAccounts).where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId)));
				account = (acctExisting as any)[0];
				if (!account) {
					const ins = await db.insert(loyaltyAccounts).values({ orgId: me.orgId, customerId, points: 0 } as any).returning();
					account = ins[0];
				}
			}

			// Apply redeem discount if requested and account available
			const redeemDiscount = customerPhone && account && redeemPoints > 0 ? (redeemPoints / 100) : 0;
			if (redeemDiscount > 0) {
				if (account.points < redeemPoints) {
					if (hasTx && pg) await pg.query('ROLLBACK');
					return res.status(400).json({ error: 'Insufficient loyalty points' });
				}
			}

			const effectiveDiscount = discountNum + redeemDiscount;
			const adjustedTotal = Math.max(0, subtotalNum - effectiveDiscount + taxNum);
			// Trust client amounts within small epsilon; adjust server-side total to reflect redemption
			const inserted = await db.insert(sales).values({
				orgId: me.orgId,
				storeId: parsed.data.storeId,
				cashierId: me.id,
				subtotal: String(subtotalNum),
				discount: String(effectiveDiscount),
				tax: String(taxNum),
				total: String(adjustedTotal),
				paymentMethod: parsed.data.paymentMethod,
				idempotencyKey,
			} as any).returning();
			const sale = inserted[0];

			for (const item of parsed.data.items) {
				await db.insert(saleItems).values({
					saleId: sale.id,
					productId: item.productId,
					quantity: item.quantity,
					unitPrice: item.unitPrice,
					lineDiscount: item.lineDiscount,
					lineTotal: item.lineTotal,
				} as any);

				if (typeof (db as any).execute === 'function') {
					await (db as any).execute(sql`UPDATE inventory SET quantity = quantity - ${item.quantity} WHERE store_id = ${parsed.data.storeId} AND product_id = ${item.productId}`);
				}
			}

			// Loyalty transactions: record redeem (negative) and earn (positive)
			if (customerId && account) {
				// Redeem first
				if (redeemDiscount > 0 && redeemPoints > 0) {
					const newBal = Number(account.points) - redeemPoints;
					const upd = await db.update(loyaltyAccounts).set({ points: newBal }).where(eq(loyaltyAccounts.id, account.id)).returning();
					account = upd[0];
					await db.insert(loyaltyTransactions).values({ loyaltyAccountId: account.id, points: -redeemPoints, reason: 'redeem' } as any);
				}
				// Earn: 1 point per 1.00 currency unit of (subtotal - discounts)
				const spendBase = Math.max(0, subtotalNum - effectiveDiscount);
				const pointsEarned = Math.floor(spendBase);
				if (pointsEarned > 0) {
					const upd = await db.update(loyaltyAccounts).set({ points: Number(account.points) + pointsEarned }).where(eq(loyaltyAccounts.id, account.id)).returning();
					account = upd[0];
					await db.insert(loyaltyTransactions).values({ loyaltyAccountId: account.id, points: pointsEarned, reason: 'earn' } as any);
				}
			}

			if (hasTx && pg) await pg.query('COMMIT');

			// Redis rollups and websocket event (fire-and-forget)
			try {
				// Resolve orgId from store for channeling by org
				const srow = await db.select({ orgId: stores.orgId }).from(stores).where(eq(stores.id, parsed.data.storeId));
				const orgId = (srow as any)[0]?.orgId as string | undefined;
				const revenue = parseFloat(String(parsed.data.total || '0')) || 0;
				const discount = parseFloat(String(parsed.data.discount || '0')) || 0;
				const tax = parseFloat(String(parsed.data.tax || '0')) || 0;
				await incrementTodayRollups(orgId || (parsed.data as any).orgId, parsed.data.storeId, {
					revenue,
					transactions: 1,
					discount,
					tax,
				});

				const wsService = (req.app as any).wsService;
				if (wsService) {
					const payload = {
						event: 'sale:created',
						orgId: orgId || (parsed.data as any).orgId,
						storeId: parsed.data.storeId,
						delta: { revenue, transactions: 1, discount, tax },
						saleId: sale.id,
						occurredAt: new Date().toISOString(),
					};
					// Publish to store and org channels if supported by service
					if (wsService.publish) {
						await wsService.publish(`store:${parsed.data.storeId}`, payload);
						if (orgId || (parsed.data as any).orgId) {
							await wsService.publish(`org:${orgId || (parsed.data as any).orgId}`, payload);
						}
					} else if (wsService.broadcastNotification) {
						await wsService.broadcastNotification({
							type: 'sales_update',
							storeId: parsed.data.storeId,
							title: 'Sale created',
							message: `+${revenue.toFixed(2)}`,
							data: payload,
							priority: 'low',
						});
					}
				}
			} catch {}

			res.json(sale);
		} catch (e) {
			if (hasTx && pg) {
				try { await pg.query('ROLLBACK'); } catch {}
			}
			res.status(500).json({ error: 'Failed to record sale' });
		} finally {
			if (hasTx && pg) pg.release();
		}
	});

	// POS Returns: restore inventory based on original sale items
	const ReturnSchema = z.object({
		saleId: z.string().uuid(),
		reason: z.string().optional(),
		storeId: z.string().uuid(),
	});

	app.post('/api/pos/returns', requireAuth, requireRole('CASHIER'), enforceIpWhitelist, async (req: Request, res: Response) => {
		const parsed = ReturnSchema.safeParse(req.body);
		if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

		// Verify sale exists and not already returned
		const saleRows = await db.select().from(sales).where(eq(sales.id, parsed.data.saleId));
		const sale = saleRows[0];
		if (!sale) return res.status(404).json({ error: 'Sale not found' });
		if (sale.status === 'RETURNED') return res.status(409).json({ error: 'Sale already returned' });

		const client2 = (db as any).client;
		const hasTx2 = !!client2;
		const pg2 = hasTx2 ? await client2.connect() : null;
		try {
			if (hasTx2 && pg2) await pg2.query('BEGIN');

			// Mark sale as returned
			if (typeof (db as any).execute === 'function') {
				await (db as any).execute(sql`UPDATE sales SET status = 'RETURNED' WHERE id = ${parsed.data.saleId}`);
			}

			// Fetch sale items
			const items = await db.select().from(saleItems).where(eq(saleItems.saleId, parsed.data.saleId));

			// Restore inventory per item
			for (const item of items) {
				if (typeof (db as any).execute === 'function') {
					await (db as any).execute(sql`UPDATE inventory SET quantity = quantity + ${item.quantity} WHERE store_id = ${parsed.data.storeId} AND product_id = ${item.productId}`);
				}
			}

			// Record return entry
			const insertedReturn = await db.insert(returns).values({
				saleId: parsed.data.saleId,
				reason: parsed.data.reason,
				processedBy: (req.session as any).userId,
			} as any).returning();
			const ret = insertedReturn[0];

			if (hasTx2 && pg2) await pg2.query('COMMIT');
			res.status(201).json({ ok: true, return: ret });
		} catch (e) {
			if (hasTx2 && pg2) {
				try { await pg2.query('ROLLBACK'); } catch {}
			}
			res.status(500).json({ error: 'Failed to process return' });
		} finally {
			if (hasTx2 && pg2) pg2.release();
		}
	});
}


