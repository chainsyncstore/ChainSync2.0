import { parse as csvParse } from 'csv-parse';
import { and, eq } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { customers, users, stores } from '@shared/prd-schema';
import { db } from '../db';
import { logger } from '../lib/logger';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { sensitiveEndpointRateLimit } from '../middleware/security';

const CreateCustomerSchema = z.object({
  phone: z.string().min(3).max(32),
  name: z.string().max(255).optional().nullable(),
});

export async function registerCustomerRoutes(app: Express) {
  // GET /customers?phone=
  app.get('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId as string | undefined;
      let orgId: string | undefined;
      if (userId) {
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        orgId = me?.orgId || undefined;
      }
      if (!orgId) {
        const storeId = String(req.query.storeId || '').trim();
        if (storeId) {
          const s = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
          orgId = s[0]?.orgId;
        }
      }
      if (!orgId) return res.status(400).json({ error: 'Missing org' });

      const phone = String(req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      const rows = await db.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.phone, phone))).limit(1);
      res.json(rows[0] || null);
    } catch (error) {
      logger.error('Failed to search customers', {
        userId: req.session?.userId,
        query: req.query,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  // POST /customers
  app.post('/api/customers', requireAuth, enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = CreateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    try {
      const userId = req.session?.userId as string | undefined;
      let orgId: string | undefined;
      if (userId) {
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        orgId = me?.orgId || undefined;
      }
      if (!orgId && (req.body?.storeId || req.query?.storeId)) {
        const storeId = String(req.body?.storeId || (req.query as any)?.storeId || '').trim();
        const s = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
        orgId = s[0]?.orgId;
      }
      if (!orgId) return res.status(400).json({ error: 'Missing org' });

      // Upsert by (orgId, phone)
      const existing = await db.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.phone, parsed.data.phone))).limit(1);
      if (existing[0]) return res.json(existing[0]);

      const [created] = await db.insert(customers).values({
        orgId,
        phone: parsed.data.phone,
        name: parsed.data.name || null,
      } as unknown as typeof customers.$inferInsert).returning();

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
    name: z.string().max(255).optional(),
    first_name: z.string().max(255).optional(),
    last_name: z.string().max(255).optional(),
  });

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

      try {
        const userId = req.session?.userId as string | undefined;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });
        const [me] = await db.select().from(users).where(eq(users.id, userId));
        const orgId = me?.orgId as string | undefined;
        if (!orgId) return res.status(400).json({ error: 'Organization could not be resolved' });

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

        for (const raw of records) {
          const phoneCandidate = String(raw.phone ?? raw.phone_number ?? raw.Phone ?? '').trim();
          const nameCandidate = raw.name ?? raw.Name ?? undefined;
          const firstName = raw.first_name ?? raw.firstName ?? raw.FirstName ?? undefined;
          const lastName = raw.last_name ?? raw.lastName ?? raw.LastName ?? undefined;

          const parsed = CustomerImportRowSchema.safeParse({
            phone: phoneCandidate,
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

          try {
            const existing = await db
              .select()
              .from(customers)
              .where(and(eq(customers.orgId, orgId), eq(customers.phone, record.phone)))
              .limit(1);

            if (existing[0]) {
              if (nameValue && existing[0].name !== nameValue) {
                await db
                  .update(customers)
                  .set({ name: nameValue } as any)
                  .where(eq(customers.id, existing[0].id));
              }
              updated += 1;
            } else {
              await db
                .insert(customers)
                .values({ orgId, phone: record.phone, name: nameValue } as any);
              created += 1;
            }
          } catch (processingError) {
            invalidRows.push({
              row: raw,
              error: processingError instanceof Error ? processingError.message : String(processingError),
            });
          }
        }

        return res.status(200).json({ imported: created, updated, invalid: invalidRows.length, invalidRows });
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


