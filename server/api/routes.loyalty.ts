import { randomUUID } from 'crypto';
import { parse as csvParse } from 'csv-parse';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  customers as loyaltyCustomers,
  legacyLoyaltyTransactions,
  loyaltyAccounts,
  loyaltyTransactions as storeLoyaltyTransactions,
  organizations,
  stores,
  users,
} from '@shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { sensitiveEndpointRateLimit } from '../middleware/security';

const EarnSchema = z.object({
  points: z.number().int().positive(),
  reason: z.string().max(255).default('earn'),
});

const RedeemSchema = z.object({
  points: z.number().int().positive(),
  reason: z.string().max(255).default('redeem'),
});

const LoyaltySettingsSchema = z.object({
  earnRate: z.number().positive().max(1000),
  redeemValue: z.number().positive().max(1000),
});

const LoyaltySettingsQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
});

const CustomerListQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(255).optional(),
  includeInactive: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lowered = value.toLowerCase();
        if (lowered === 'true' || lowered === '1') return true;
        if (lowered === 'false' || lowered === '0') return false;
      }
      return false;
    }),
});

const CreateLoyaltyCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    email: z.string().trim().email().max(255).optional().nullable(),
    phone: z.string().trim().min(6).max(32).optional().nullable(),
    loyaltyNumber: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.email?.trim() || data.phone?.trim()), {
    message: 'Either phone or email is required',
    path: ['phone'],
  });

const LoyaltyTransactionsQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type StoreScopeResult =
  | { status: number; error: string }
  | { status: 200; scope: { storeId: string; orgId: string; user: typeof users.$inferSelect } };

type StoreScopeSuccess = Extract<StoreScopeResult, { status: 200 }>;

function isStoreScopeSuccess(result: StoreScopeResult): result is StoreScopeSuccess {
  return result.status === 200 && 'scope' in result;
}

async function resolveStoreScope(req: Request, requestedStoreId?: string): Promise<StoreScopeResult> {
  const userId = req.session?.userId as string | undefined;
  if (!userId) return { status: 401, error: 'Not authenticated' };

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { status: 401, error: 'Not authenticated' };
  if (!user.orgId) return { status: 400, error: 'Missing org' };

  if (user.isAdmin) {
    if (!requestedStoreId) {
      return { status: 400, error: 'storeId is required for admins' };
    }
    const [store] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, requestedStoreId), eq(stores.orgId, user.orgId)))
      .limit(1);
    if (!store) {
      return { status: 404, error: 'Store not found' };
    }
    return { status: 200, scope: { storeId: requestedStoreId, orgId: user.orgId, user } };
  }

  const assignedStoreId = user.storeId;
  if (!assignedStoreId) {
    return { status: 403, error: 'Store assignment required' };
  }
  if (requestedStoreId && requestedStoreId !== assignedStoreId) {
    return { status: 403, error: 'Forbidden for requested store' };
  }

  const [store] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, assignedStoreId), eq(stores.orgId, user.orgId)))
    .limit(1);
  if (!store) {
    return { status: 404, error: 'Store not found' };
  }

  return { status: 200, scope: { storeId: assignedStoreId, orgId: user.orgId, user } };
}

function generateLoyaltyNumber(): string {
  return `LOY-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const LoyaltyImportModeSchema = z.enum(['overwrite', 'regularize']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadSingle: any = upload.single('file');
const MAX_POINTS = 1_000_000_000;
const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n']);

const normalizeName = (value?: string | null) => {
  if (!value) return '';
  return String(value).trim().slice(0, 255);
};

const coercePoints = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return 0;
  const numeric = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(numeric)) return null;
  const intVal = Math.trunc(numeric);
  if (intVal < 0 || intVal > MAX_POINTS) return null;
  return intVal;
};

const coerceBoolean = (value: unknown, fallback = true): boolean | null => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
};

async function generateUniqueLoyaltyNumber(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const candidate = generateLoyaltyNumber();
    const [existing] = await db
      .select({ id: loyaltyCustomers.id })
      .from(loyaltyCustomers)
      .where(eq(loyaltyCustomers.loyaltyNumber, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error('Unable to issue loyalty number');
}

export async function registerLoyaltyRoutes(app: Express) {
  app.get('/api/loyalty/settings', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsedQuery = LoyaltySettingsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsedQuery.error.flatten() });
    }

    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

      const requestedStoreId = parsedQuery.data.storeId;
      let effectiveStoreId: string | undefined;
      if (me.isAdmin) {
        effectiveStoreId = requestedStoreId;
      } else {
        if (!me.storeId) return res.status(403).json({ error: 'Store assignment required' });
        if (requestedStoreId && requestedStoreId !== me.storeId) {
          return res.status(403).json({ error: 'Forbidden for requested store' });
        }
        effectiveStoreId = me.storeId;
      }

      let store: typeof stores.$inferSelect | undefined;
      if (effectiveStoreId) {
        const storeRows = await db
          .select()
          .from(stores)
          .where(and(eq(stores.id, effectiveStoreId), eq(stores.orgId, me.orgId)))
          .limit(1);
        store = storeRows[0];
        if (!store) {
          return res.status(404).json({ error: 'Store not found' });
        }
      }

      const [org] = await db.select().from(organizations).where(eq(organizations.id, me.orgId));
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const storeEarn = store?.loyaltyEarnRateOverride;
      const storeRedeem = store?.loyaltyRedeemValueOverride;
      const earnRate = Number(storeEarn ?? org.loyaltyEarnRate ?? 1);
      const redeemValue = Number(storeRedeem ?? org.loyaltyRedeemValue ?? 0.01);
      const scope = store ? (storeEarn || storeRedeem ? 'store' : 'org') : 'org';

      return res.json({
        earnRate,
        redeemValue,
        scope,
        storeId: store?.id ?? null,
      });
    } catch (error) {
      logger.error('Failed to load loyalty settings', {
        userId: req.session?.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to load loyalty settings' });
    }
  });

  app.put(
    '/api/loyalty/settings',
    requireAuth,
    enforceIpWhitelist,
    requireRole('ADMIN'),
    async (req: Request, res: Response) => {
      const UpdateSchema = LoyaltySettingsSchema.extend({
        storeId: z.string().uuid().optional(),
      });
      const parsed = UpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      try {
        const userId = req.session?.userId as string | undefined;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const [me] = await db.select().from(users).where(eq(users.id, userId));
        if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

        const targetStoreId = parsed.data.storeId;
        if (targetStoreId) {
          const [store] = await db
            .select()
            .from(stores)
            .where(and(eq(stores.id, targetStoreId), eq(stores.orgId, me.orgId)))
            .limit(1);
          if (!store) {
            return res.status(404).json({ error: 'Store not found' });
          }

          const [updatedStore] = await db
            .update(stores)
            .set({
              loyaltyEarnRateOverride: parsed.data.earnRate,
              loyaltyRedeemValueOverride: parsed.data.redeemValue,
              updatedAt: new Date(),
            } as Partial<typeof stores.$inferInsert>)
            .where(eq(stores.id, targetStoreId))
            .returning();

          return res.json({
            earnRate: Number(updatedStore.loyaltyEarnRateOverride ?? parsed.data.earnRate),
            redeemValue: Number(updatedStore.loyaltyRedeemValueOverride ?? parsed.data.redeemValue),
            scope: 'store',
            storeId: targetStoreId,
          });
        }

        const [updatedOrg] = await db
          .update(organizations)
          .set({
            loyaltyEarnRate: parsed.data.earnRate,
            loyaltyRedeemValue: parsed.data.redeemValue,
          } as any)
          .where(eq(organizations.id, me.orgId))
          .returning();

        if (!updatedOrg) {
          return res.status(404).json({ error: 'Organization not found' });
        }

        return res.json({
          earnRate: Number(updatedOrg.loyaltyEarnRate ?? parsed.data.earnRate),
          redeemValue: Number(updatedOrg.loyaltyRedeemValue ?? parsed.data.redeemValue),
          scope: 'org',
          storeId: null,
        });
      } catch (error) {
        logger.error('Failed to update loyalty settings', {
          userId: req.session?.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ error: 'Failed to update loyalty settings' });
      }
    }
  );

  app.get(
    '/api/loyalty/customers',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    async (req: Request, res: Response) => {
      const parsed = CustomerListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });
      }

      const scopeResult = await resolveStoreScope(req, parsed.data.storeId);
      if (!isStoreScopeSuccess(scopeResult)) {
        return res.status(scopeResult.status).json({ error: scopeResult.error });
      }
      const {
        scope: { storeId },
      } = scopeResult;

      const { page, pageSize, search, includeInactive } = parsed.data;
      const offset = (page - 1) * pageSize;

      const filters = [eq(loyaltyCustomers.storeId, storeId)];
      if (!includeInactive) {
        filters.push(eq(loyaltyCustomers.isActive, true));
      }
      if (search) {
        const term = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`;
        filters.push(
          or(
            ilike(loyaltyCustomers.firstName, term),
            ilike(loyaltyCustomers.lastName, term),
            ilike(loyaltyCustomers.email, term),
            ilike(loyaltyCustomers.phone, term),
            ilike(loyaltyCustomers.loyaltyNumber, term)
          )
        );
      }

      const whereClause = filters.length === 1 ? filters[0] : and(...filters);

      const totalResult = await db
        .select({ count: sql`COUNT(*)` })
        .from(loyaltyCustomers)
        .where(whereClause);
      const total = Number(totalResult[0]?.count ?? 0);

      const rows = await db
        .select({
          id: loyaltyCustomers.id,
          firstName: loyaltyCustomers.firstName,
          lastName: loyaltyCustomers.lastName,
          email: loyaltyCustomers.email,
          phone: loyaltyCustomers.phone,
          loyaltyNumber: loyaltyCustomers.loyaltyNumber,
          currentPoints: loyaltyCustomers.currentPoints,
          lifetimePoints: loyaltyCustomers.lifetimePoints,
          isActive: loyaltyCustomers.isActive,
          createdAt: loyaltyCustomers.createdAt,
          updatedAt: loyaltyCustomers.updatedAt,
        })
        .from(loyaltyCustomers)
        .where(whereClause)
        .orderBy(desc(loyaltyCustomers.createdAt))
        .limit(pageSize)
        .offset(offset);

      return res.json({
        data: rows,
        page,
        pageSize,
        total,
      });
    }
  );

  app.post(
    '/api/loyalty/customers',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    async (req: Request, res: Response) => {
      const parsed = CreateLoyaltyCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const scopeResult = await resolveStoreScope(req, undefined);
      if (!isStoreScopeSuccess(scopeResult)) {
        return res.status(scopeResult.status).json({ error: scopeResult.error });
      }
      const {
        scope: { storeId, user },
      } = scopeResult;

      if (user.isAdmin) {
        return res.status(403).json({ error: 'Admins cannot modify loyalty customers' });
      }

      const payload = parsed.data;
      const normalizedEmail = payload.email?.trim().toLowerCase() || null;
      const normalizedPhone = payload.phone?.trim() || null;
      const requestedLoyaltyNumber = payload.loyaltyNumber?.trim() || null;

      try {
        const duplicateChecks: any[] = [];
        if (normalizedPhone) duplicateChecks.push(eq(loyaltyCustomers.phone, normalizedPhone));
        if (normalizedEmail) duplicateChecks.push(eq(loyaltyCustomers.email, normalizedEmail));
        if (requestedLoyaltyNumber) duplicateChecks.push(eq(loyaltyCustomers.loyaltyNumber, requestedLoyaltyNumber));

        if (duplicateChecks.length > 0) {
          const duplicateCondition =
            duplicateChecks.length === 1 ? duplicateChecks[0] : or(...duplicateChecks);
          const existing = await db
            .select({ id: loyaltyCustomers.id })
            .from(loyaltyCustomers)
            .where(and(eq(loyaltyCustomers.storeId, storeId), duplicateCondition))
            .limit(1);
          if (existing[0]) {
            return res.status(409).json({ error: 'Customer already exists for this store' });
          }
        }

        const [created] = await db
          .insert(loyaltyCustomers)
          .values({
            storeId,
            firstName: payload.firstName.trim(),
            lastName: payload.lastName.trim(),
            email: normalizedEmail,
            phone: normalizedPhone,
            loyaltyNumber: requestedLoyaltyNumber || generateLoyaltyNumber(),
          } as typeof loyaltyCustomers.$inferInsert)
          .returning();

        return res.status(201).json(created);
      } catch (error) {
        logger.error('Failed to create loyalty customer', {
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ error: 'Failed to create customer' });
      }
    }
  );

  const toggleCustomerStatus = (isActive: boolean) =>
    async (req: Request, res: Response) => {
      const customerId = req.params.customerId;
      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      const [customer] = await db
        .select({
          id: loyaltyCustomers.id,
          storeId: loyaltyCustomers.storeId,
          isActive: loyaltyCustomers.isActive,
        })
        .from(loyaltyCustomers)
        .where(eq(loyaltyCustomers.id, customerId))
        .limit(1);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const scopeResult = await resolveStoreScope(req, customer.storeId);
      if (!isStoreScopeSuccess(scopeResult)) {
        return res.status(scopeResult.status).json({ error: scopeResult.error });
      }

      if (scopeResult.scope.user.isAdmin) {
        return res.status(403).json({ error: 'Admins cannot modify loyalty customers' });
      }

      if (customer.isActive === isActive) {
        return res.json(customer);
      }

      const [updated] = await db
        .update(loyaltyCustomers)
        .set({ isActive, updatedAt: new Date() } as Partial<typeof loyaltyCustomers.$inferInsert>)
        .where(eq(loyaltyCustomers.id, customer.id))
        .returning();

      return res.json(updated);
    };

  app.post(
    '/api/loyalty/customers/:customerId/deactivate',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    toggleCustomerStatus(false)
  );

  app.post(
    '/api/loyalty/customers/:customerId/reactivate',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    toggleCustomerStatus(true)
  );

  app.post(
    '/api/loyalty/import',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    sensitiveEndpointRateLimit,
    uploadSingle,
    async (req: Request, res: Response) => {
      const uploaded = (req as any).file as { buffer: Buffer } | undefined;
      if (!uploaded) {
        return res.status(400).json({ error: 'file is required' });
      }

      const modeInput = typeof req.body?.mode === 'string' ? req.body.mode.toLowerCase() : '';
      const parsedMode = LoyaltyImportModeSchema.safeParse(modeInput);
      if (!parsedMode.success) {
        return res.status(400).json({ error: 'mode must be either overwrite or regularize' });
      }
      const mode = parsedMode.data;

      const scopeResult = await resolveStoreScope(req, undefined);
      if (!isStoreScopeSuccess(scopeResult)) {
        return res.status(scopeResult.status).json({ error: scopeResult.error });
      }
      const {
        scope: { storeId, user },
      } = scopeResult;
      if (user.isAdmin) {
        return res.status(403).json({ error: 'Admins cannot import loyalty customers' });
      }

      const csv = uploaded.buffer.toString('utf-8');
      const records: any[] = [];
      try {
        await new Promise<void>((resolve, reject) => {
          csvParse(csv, { columns: true, trim: true, skip_empty_lines: true }, (err, out) => {
            if (err) return reject(err);
            records.push(...out);
            resolve();
          });
        });
      } catch (error) {
        logger.error('Failed parsing loyalty import CSV', {
          userId: req.session?.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(400).json({ error: 'Invalid CSV format' });
      }

      if (records.length === 0) {
        return res.status(400).json({ error: 'CSV is empty' });
      }

      const invalidRows: Array<{ row: any; error: string }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of records) {
        if (invalidRows.length >= 50) {
          break;
        }

        const firstName = normalizeName(raw.first_name ?? raw.firstName ?? raw.FirstName);
        const lastName = normalizeName(raw.last_name ?? raw.lastName ?? raw.LastName);
        const emailRaw = raw.email ?? raw.Email ?? raw.email_address ?? raw.EmailAddress;
        const phoneRaw = raw.phone ?? raw.Phone ?? raw.phone_number ?? raw.PhoneNumber;
        const memberSinceRaw = raw.member_since ?? raw.MemberSince;
        const loyaltyNumberRaw = raw.loyalty_number ?? raw.loyaltyNumber ?? raw.LoyaltyNumber;

        if (!firstName || !lastName) {
          invalidRows.push({ row: raw, error: 'first_name and last_name are required' });
          continue;
        }
        if (!emailRaw && !phoneRaw) {
          invalidRows.push({ row: raw, error: 'Provide phone or email to match customers' });
          continue;
        }

        const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;
        if (email && email.length > 255) {
          invalidRows.push({ row: raw, error: 'email is too long' });
          continue;
        }
        const phone = phoneRaw ? String(phoneRaw).trim().slice(0, 50) : null;

        const currentPoints = coercePoints(raw.current_points ?? raw.currentPoints);
        const lifetimePoints = coercePoints(raw.lifetime_points ?? raw.lifetimePoints ?? currentPoints ?? 0);
        if (currentPoints === null || lifetimePoints === null) {
          invalidRows.push({ row: raw, error: 'Points must be whole numbers between 0 and 1,000,000,000' });
          continue;
        }
        if (lifetimePoints < currentPoints) {
          invalidRows.push({ row: raw, error: 'lifetime_points cannot be less than current_points' });
          continue;
        }

        const isActiveParsed = coerceBoolean(raw.is_active ?? raw.active ?? true, true);
        if (isActiveParsed === null) {
          invalidRows.push({ row: raw, error: 'is_active must be true/false' });
          continue;
        }

        const memberSinceParsed = memberSinceRaw ? new Date(memberSinceRaw) : null;
        if (memberSinceParsed && Number.isNaN(memberSinceParsed.getTime())) {
          invalidRows.push({ row: raw, error: 'member_since must be a valid date (YYYY-MM-DD)' });
          continue;
        }

        let loyaltyNumber = loyaltyNumberRaw ? String(loyaltyNumberRaw).trim().slice(0, 255) : null;

        try {
          const orFilters = [] as any[];
          if (phone) orFilters.push(eq(loyaltyCustomers.phone, phone));
          if (email) orFilters.push(eq(loyaltyCustomers.email, email));
          if (loyaltyNumber) orFilters.push(eq(loyaltyCustomers.loyaltyNumber, loyaltyNumber));

          let existing = null;
          if (orFilters.length > 0) {
            const matchCondition = orFilters.length === 1 ? orFilters[0] : or(...orFilters);
            const rows = await db
              .select()
              .from(loyaltyCustomers)
              .where(and(eq(loyaltyCustomers.storeId, storeId), matchCondition))
              .limit(1);
            existing = rows[0] ?? null;
          }

          if (existing) {
            if (mode === 'regularize') {
              skipped += 1;
              continue;
            }

            const updatePayload: Record<string, any> = {};
            if (email && existing.email !== email) updatePayload.email = email;
            if (phone && existing.phone !== phone) updatePayload.phone = phone;
            if (loyaltyNumber && existing.loyaltyNumber !== loyaltyNumber) updatePayload.loyaltyNumber = loyaltyNumber;
            if (existing.firstName !== firstName) updatePayload.firstName = firstName;
            if (existing.lastName !== lastName) updatePayload.lastName = lastName;
            if (existing.currentPoints !== currentPoints) updatePayload.currentPoints = currentPoints;
            if (existing.lifetimePoints !== lifetimePoints) updatePayload.lifetimePoints = lifetimePoints;
            if (existing.isActive !== isActiveParsed) updatePayload.isActive = isActiveParsed;
            if (memberSinceParsed && existing.createdAt.toISOString() !== memberSinceParsed.toISOString()) {
              updatePayload.createdAt = memberSinceParsed;
            }

            if (Object.keys(updatePayload).length > 0) {
              await db
                .update(loyaltyCustomers)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(eq(loyaltyCustomers.id, existing.id));
            }

            updated += 1;
            continue;
          }

          if (!loyaltyNumber) {
            loyaltyNumber = await generateUniqueLoyaltyNumber();
          }

          await db.insert(loyaltyCustomers).values({
            storeId,
            firstName,
            lastName,
            email,
            phone,
            loyaltyNumber,
            currentPoints,
            lifetimePoints,
            isActive: isActiveParsed,
            createdAt: memberSinceParsed ?? new Date(),
          } as any);

          created += 1;
        } catch (error) {
          logger.error('Failed processing loyalty import row', {
            userId: req.session?.userId,
            row: raw,
            error: error instanceof Error ? error.message : String(error),
          });
          invalidRows.push({ row: raw, error: error instanceof Error ? error.message : String(error) });
        }
      }

      return res.status(200).json({
        mode,
        imported: created,
        updated,
        skipped,
        invalid: invalidRows.length,
        invalidRows,
      });
    }
  );

  app.get(
    '/api/loyalty/transactions',
    requireAuth,
    enforceIpWhitelist,
    requireRole('MANAGER'),
    async (req: Request, res: Response) => {
      const parsed = LoyaltyTransactionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });
      }

      const scopeResult = await resolveStoreScope(req, parsed.data.storeId);
      if (!isStoreScopeSuccess(scopeResult)) {
        return res.status(scopeResult.status).json({ error: scopeResult.error });
      }
      const {
        scope: { storeId },
      } = scopeResult;

      const { page, pageSize, customerId } = parsed.data;
      const offset = (page - 1) * pageSize;

      const filters = [eq(loyaltyCustomers.storeId, storeId)];
      if (customerId) {
        filters.push(eq(storeLoyaltyTransactions.customerId, customerId));
      }

      const whereClause = filters.length === 1 ? filters[0] : and(...filters);

      const totalResult = await db
        .select({ count: sql`COUNT(*)` })
        .from(storeLoyaltyTransactions)
        .innerJoin(loyaltyCustomers, eq(storeLoyaltyTransactions.customerId, loyaltyCustomers.id))
        .where(whereClause);
      const total = Number(totalResult[0]?.count ?? 0);

      const rows = await db
        .select({
          id: storeLoyaltyTransactions.id,
          customerId: storeLoyaltyTransactions.customerId,
          transactionId: storeLoyaltyTransactions.transactionId,
          pointsEarned: storeLoyaltyTransactions.pointsEarned,
          pointsRedeemed: storeLoyaltyTransactions.pointsRedeemed,
          pointsBefore: storeLoyaltyTransactions.pointsBefore,
          pointsAfter: storeLoyaltyTransactions.pointsAfter,
          createdAt: storeLoyaltyTransactions.createdAt,
          customerFirstName: loyaltyCustomers.firstName,
          customerLastName: loyaltyCustomers.lastName,
          loyaltyNumber: loyaltyCustomers.loyaltyNumber,
        })
        .from(storeLoyaltyTransactions)
        .innerJoin(loyaltyCustomers, eq(storeLoyaltyTransactions.customerId, loyaltyCustomers.id))
        .where(whereClause)
        .orderBy(desc(storeLoyaltyTransactions.createdAt))
        .limit(pageSize)
        .offset(offset);

      return res.json({ data: rows, page, pageSize, total });
    }
  );

  // GET /loyalty/:customerId
  app.get('/api/loyalty/:customerId', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });

      const customerId = req.params.customerId;
      const [acct] = await db.select().from(loyaltyAccounts)
        .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId)))
        .limit(1);
      if (!acct) return res.json({ points: 0, tier: null, transactions: [] });

      const tx = await db.select().from(legacyLoyaltyTransactions)
        .where(eq(legacyLoyaltyTransactions.loyaltyAccountId, acct.id))
        .orderBy(desc(legacyLoyaltyTransactions.createdAt))
        .limit(50);
      return res.json({ points: acct.points, tier: acct.tier, transactions: tx });
    } catch (error) {
      logger.error('Failed to load loyalty account', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to load loyalty' });
    }
  });

  // POST /loyalty/:id/earn
  app.post('/api/loyalty/:customerId/earn', requireAuth, enforceIpWhitelist, requireRole('CASHIER'), async (req: Request, res: Response) => {
    const parsed = EarnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });
      const customerId = req.params.customerId;

      const client = (db as any).client;
      const hasTx = !!client;
      const pg = hasTx ? await client.connect() : null;
      try {
        if (hasTx && pg) await pg.query('BEGIN');

        // Ensure account
        const [acctExisting] = await db.select().from(loyaltyAccounts)
          .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId))).limit(1);
        let account = acctExisting;
        if (!account) {
          const inserted = await db.insert(loyaltyAccounts).values({ orgId: me.orgId, customerId, points: 0 } as any).returning();
          account = inserted[0];
        }

        const newPoints = Number(account.points) + parsed.data.points;
        const [updated] = await db
          .update(loyaltyAccounts)
          .set({ points: newPoints } as any)
          .where(eq(loyaltyAccounts.id, account.id))
          .returning();

        await db.insert(legacyLoyaltyTransactions).values({
          loyaltyAccountId: account.id,
          points: parsed.data.points,
          reason: parsed.data.reason,
        } as any);

        if (hasTx && pg) await pg.query('COMMIT');
        return res.json({ points: updated.points });
      } catch (error) {
        if (hasTx && pg) {
          try {
            await pg.query('ROLLBACK');
          } catch (rollbackError) {
            logger.warn('Loyalty earn rollback failed', {
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            });
          }
        }
        logger.error('Failed to earn loyalty points', {
          userId,
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        return res.status(500).json({ error: 'Failed to earn points' });
      } finally {
        if (hasTx && pg) pg.release();
      }
    } catch (error) {
      logger.error('Failed to earn loyalty points', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to earn points' });
    }
  });

  // POST /loyalty/:id/redeem
  app.post('/api/loyalty/:customerId/redeem', requireAuth, enforceIpWhitelist, requireRole('CASHIER'), async (req: Request, res: Response) => {
    const parsed = RedeemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const [me] = await db.select().from(users).where(eq(users.id, userId));
      if (!me?.orgId) return res.status(400).json({ error: 'Missing org' });
      const customerId = req.params.customerId;

      const client = (db as any).client;
      const hasTx = !!client;
      const pg = hasTx ? await client.connect() : null;
      try {
        if (hasTx && pg) await pg.query('BEGIN');

        // Load account
        const [acct] = await db.select().from(loyaltyAccounts)
          .where(and(eq(loyaltyAccounts.orgId, me.orgId), eq(loyaltyAccounts.customerId, customerId))).limit(1);
        if (!acct || acct.points < parsed.data.points) {
          await pg.query('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient points' });
        }

        const newPoints = Number(acct.points) - parsed.data.points;
        const [updated] = await db
          .update(loyaltyAccounts)
          .set({ points: newPoints } as any)
          .where(eq(loyaltyAccounts.id, acct.id))
          .returning();

        await db.insert(legacyLoyaltyTransactions).values({
          loyaltyAccountId: acct.id,
          points: -parsed.data.points,
          reason: parsed.data.reason,
        } as any);

        if (hasTx && pg) await pg.query('COMMIT');
        return res.json({ points: updated.points });
      } catch (error) {
        if (hasTx && pg) {
          try {
            await pg.query('ROLLBACK');
          } catch (rollbackError) {
            logger.warn('Loyalty redeem rollback failed', {
              error: rollbackError instanceof Error ? error.message : String(rollbackError)
            });
          }
        }
        logger.error('Failed to redeem loyalty points', {
          userId,
          customerId,
          error: error instanceof Error ? error.message : String(error)
        });
        return res.status(500).json({ error: 'Failed to redeem points' });
      } finally {
        if (hasTx && pg) pg.release();
      }
    } catch (error) {
      logger.error('Failed to redeem loyalty points', {
        userId: req.session?.userId,
        customerId: req.params.customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to redeem points' });
    }
  });
}


