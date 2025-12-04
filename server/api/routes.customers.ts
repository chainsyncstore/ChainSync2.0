import { parse as csvParse } from 'csv-parse';
import { and, eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { customers, users } from '@shared/schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { sensitiveEndpointRateLimit } from '../middleware/security';

const CreateCustomerSchema = z.object({
  phone: z.string().min(3).max(32),
  name: z.string().max(255).optional().nullable(),
});

export async function registerCustomerRoutes(app: Express) {
  // GET /customers?phone= - lookup loyalty customer by phone
  app.get('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    try {
      const storeId = String(req.query.storeId || '').trim();
      if (!storeId) return res.status(400).json({ error: 'storeId is required' });

      const phone = String(req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      // Query the loyalty customers table by storeId and phone
      const rows = await db.select({
        id: customers.id,
        phone: customers.phone,
        name: customers.firstName,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        currentPoints: customers.currentPoints,
        lifetimePoints: customers.lifetimePoints,
        loyaltyNumber: customers.loyaltyNumber,
      }).from(customers).where(and(eq(customers.storeId, storeId), eq(customers.phone, phone))).limit(1);
      
      const customer = rows[0];
      if (customer) {
        // Return with a computed name field for backward compatibility
        res.json({
          ...customer,
          name: `${customer.firstName} ${customer.lastName}`.trim() || customer.phone,
        });
      } else {
        res.json(null);
      }
    } catch (error) {
      logger.error('Failed to search customers', {
        userId: req.session?.userId,
        query: req.query,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  // POST /customers - create a new loyalty customer
  app.post('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = CreateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const storeId = String(req.body?.storeId || (req.query as any)?.storeId || '').trim();
      if (!storeId) return res.status(400).json({ error: 'storeId is required' });

      // Check if customer already exists by phone
      const existing = await db.select().from(customers).where(and(eq(customers.storeId, storeId), eq(customers.phone, parsed.data.phone))).limit(1);
      if (existing[0]) return res.json(existing[0]);

      // Parse name into firstName/lastName
      const nameParts = (parsed.data.name || '').trim().split(' ');
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || '';

      const [created] = await db.insert(customers).values({
        storeId,
        phone: parsed.data.phone,
        firstName,
        lastName,
        currentPoints: 0,
        lifetimePoints: 0,
      } as typeof customers.$inferInsert).returning();

      return res.status(201).json(created);
    } catch (error) {
      logger.error('Failed to create customer', {
        userId: req.session?.userId,
        body: req.body,
        error: error instanceof Error ? error.message : String(error)
      });
      return res.status(500).json({ error: 'Failed to create customer' });
    }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  const uploadSingle: any = upload.single('file');
  const CustomerImportRowSchema = z.object({
    phone: z.string().min(3).max(32),
    email: z.string().email().max(255).optional(),
    name: z.string().max(255).optional(),
    first_name: z.string().max(255).optional(),
    last_name: z.string().max(255).optional(),
  });

  const CustomerImportModeSchema = z.enum(['overwrite', 'regularize']);

  app.post(
    '/api/customers/import',
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
      const parsedMode = CustomerImportModeSchema.safeParse(modeInput);
      if (!parsedMode.success) {
        return res.status(400).json({ error: 'mode must be either overwrite or regularize' });
      }
      const mode = parsedMode.data;

      try {
        const userId = req.session?.userId as string | undefined;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        const storeId = me?.storeId as string | undefined;
        if (!storeId) return res.status(400).json({ error: 'Store could not be resolved' });

        const text = uploaded.buffer.toString('utf-8');
        const records: any[] = [];
        await new Promise<void>((resolve, reject) => {
          csvParse(text, { columns: true, trim: true }, (err: any, out: any[]) => {
            if (err) return reject(err);
            records.push(...out);
            resolve();
          });
        });

        const invalidRows: Array<{ row: any; error: string }> = [];
        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const raw of records) {
          const phoneCandidate = String(raw.phone ?? raw.phone_number ?? raw.Phone ?? '').trim();
          const nameCandidate = raw.name ?? raw.Name ?? undefined;
          const firstName = raw.first_name ?? raw.firstName ?? raw.FirstName ?? undefined;
          const lastName = raw.last_name ?? raw.lastName ?? raw.LastName ?? undefined;
          const emailCandidate = String(raw.email ?? raw.Email ?? raw.email_address ?? raw.EmailAddress ?? '').trim().toLowerCase();

          const parsed = CustomerImportRowSchema.safeParse({
            phone: phoneCandidate,
            email: emailCandidate || undefined,
            name: nameCandidate,
            first_name: firstName,
            last_name: lastName,
          });

          if (!parsed.success) {
            invalidRows.push({ row: raw, error: parsed.error.errors.map(e => e.message).join('; ') });
            continue;
          }

          const record = parsed.data;
          let resolvedName = record.name?.trim() ?? '';
          if (!resolvedName) {
            const parts = [record.first_name?.trim(), record.last_name?.trim()].filter(Boolean);
            resolvedName = parts.join(' ').trim();
          }
          const nameValue = resolvedName || null;
          const emailValue = record.email ?? undefined;

          try {
            let existingRow = null;
            const byPhone = await db
              .select()
              .from(customers)
              .where(and(eq(customers.storeId, storeId), eq(customers.phone, record.phone)))
              .limit(1);
            if (byPhone[0]) {
              existingRow = byPhone[0];
            } else if (emailValue) {
              const byEmail = await db
                .select()
                .from(customers)
                .where(and(eq(customers.storeId, storeId), eq(customers.email, emailValue)))
                .limit(1);
              existingRow = byEmail[0] ?? null;
            }

            if (existingRow) {
              if (mode === 'regularize') {
                skipped += 1;
                continue;
              }

              const updatePayload: Record<string, any> = {};
              // Parse name into firstName/lastName
              const nameParts = (nameValue || '').trim().split(' ');
              const firstName = nameParts[0] || existingRow.firstName;
              const lastName = nameParts.slice(1).join(' ') || existingRow.lastName;
              if (firstName !== existingRow.firstName) {
                updatePayload.firstName = firstName;
              }
              if (lastName !== existingRow.lastName) {
                updatePayload.lastName = lastName;
              }
              if (emailValue && existingRow.email !== emailValue) {
                updatePayload.email = emailValue;
              }
              if (record.phone && existingRow.phone !== record.phone) {
                updatePayload.phone = record.phone;
              }

              if (Object.keys(updatePayload).length > 0) {
                await db
                  .update(customers)
                  .set(updatePayload as any)
                  .where(eq(customers.id, existingRow.id));
              }

              updated += 1;
            } else {
              // Parse name into firstName/lastName
              const nameParts = (nameValue || '').trim().split(' ');
              const firstName = nameParts[0] || 'Customer';
              const lastName = nameParts.slice(1).join(' ') || '';
              await db
                .insert(customers)
                .values({ storeId, phone: record.phone, email: emailValue ?? null, firstName, lastName, currentPoints: 0, lifetimePoints: 0 } as typeof customers.$inferInsert);
              created += 1;
            }
          } catch (processingError) {
            invalidRows.push({
              row: raw,
              error: processingError instanceof Error ? processingError.message : String(processingError),
            });
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
      } catch (error) {
        logger.error('Failed to import customers', {
          userId: req.session?.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({ error: 'Failed to import customers' });
      }
    }
  );
}


