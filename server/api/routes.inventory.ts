import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { products, inventory, stores, users } from '@shared/prd-schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse';
import { requireAuth, enforceIpWhitelist } from '../middleware/authz';
import { storage } from '../storage';
import { sensitiveEndpointRateLimit } from '../middleware/security';
import { requireRole } from '../middleware/authz';

export async function registerInventoryRoutes(app: Express) {
  // Integration-test compatible endpoints
  app.put('/api/stores/:storeId/inventory/:productId', requireAuth, async (req: Request, res: Response) => {
    const { storeId, productId } = req.params as any;
    const { quantity } = req.body || {};
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(422).json({ status: 'error', message: 'Quantity must be a non-negative number' });
    }
    const updated = await storage.updateInventory(productId, storeId, { quantity } as any);
    return res.json({ status: 'success', data: updated });
  });

  app.get('/api/stores/:storeId/inventory', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const { category, lowStock } = req.query as any;
    let items = await storage.getInventoryByStore(storeId);
    // attach product details from in-memory store for tests
    const attachProduct = async (item: any) => ({ ...item, product: await storage.getProduct(item.productId) });
    if (lowStock === 'true') {
      items = items.filter(i => (i.quantity || 0) <= (i.minStockLevel || 0));
    }
    if (category) {
      const withProd = await Promise.all(items.map(attachProduct));
      return res.json(withProd.filter(i => i.product?.category === category));
    }
    return res.json(items);
  });

  app.get('/api/stores/:storeId/inventory/low-stock', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const items = await storage.getLowStockItems(storeId);
    const withProduct = await Promise.all(items.map(async i => ({ ...i, product: await storage.getProduct(i.productId) })));
    return res.json(withProduct);
  });

  app.post('/api/stores/:storeId/inventory/bulk-update', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const updates = (req.body?.updates as any) || null;
    if (!Array.isArray(updates)) return res.status(400).json({ message: 'Updates must be an array' });
    const results = await Promise.all(
      updates.map(async (u: any) => storage.updateInventory(u.productId, storeId, { quantity: u.quantity } as any))
    );
    return res.json(results);
  });

  app.get('/api/stores/:storeId/inventory/stock-movements', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const productId = (req.query?.productId as string) || '';
    let movements = await storage.getStockMovements(storeId);
    if (productId) movements = movements.filter(m => m.productId === productId);
    return res.json(movements.map(m => ({ ...m, timestamp: new Date(m.timestamp).toISOString() })));
  });

  app.post('/api/stores/:storeId/inventory/stock-count', requireAuth, async (req: Request, res: Response) => {
    const { storeId } = req.params as any;
    const items = (req.body?.items as any[]) || [];
    const results = await storage.performStockCount(storeId, items);
    return res.json(results);
  });
  // List products
  app.get('/api/inventory/products', async (_req: Request, res: Response) => {
    const rows = await db.select().from(products).limit(500);
    res.json(rows);
  });

  // Create product
  const ProductSchema = z.object({
    orgId: z.string().uuid(),
    sku: z.string().min(1),
    barcode: z.string().optional(),
    name: z.string().min(1),
    costPrice: z.string(),
    salePrice: z.string(),
    vatRate: z.string().optional(),
  });
  app.post('/api/inventory/products', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    const created = await db.insert(products).values(parsed.data as any).returning();
    res.json(created[0]);
  });

  // CSV template download
  app.get('/api/inventory/template.csv', sensitiveEndpointRateLimit, (_req: Request, res: Response) => {
    const file = path.resolve(process.cwd(), 'scripts/csv-templates/inventory_import_template.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    fs.createReadStream(file).pipe(res);
  });

  // Inventory import (multipart CSV), Zod validation, upsert products, per-store qty, invalid row report
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  const uploadSingle: any = upload.single('file');
  const ImportRowSchema = z.object({
    sku: z.string().min(1),
    barcode: z.string().optional().nullable(),
    name: z.string().min(1),
    cost_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    sale_price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    vat_rate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().default('0'),
    reorder_level: z.string().regex(/^\d+$/).optional().default('0'),
    initial_quantity: z.string().regex(/^\d+$/).optional().default('0'),
    store_id: z.string().uuid().optional(),
    store_code: z.string().optional(),
  });

  app.post('/api/inventory/import', requireAuth, enforceIpWhitelist, sensitiveEndpointRateLimit, uploadSingle, async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const invalidRows: Array<{ row: any; error: string }> = [];
    const results: any[] = [];

    const text = req.file.buffer.toString('utf-8');
    const records: any[] = [];
    await new Promise<void>((resolve, reject) => {
      csvParse(text, { columns: true, trim: true }, (err: any, out: any[]) => {
        if (err) return reject(err);
        records.push(...out);
        resolve();
      });
    });

    const client = (db as any).client;
    const pg = await client.connect();
    try {
      await pg.query('BEGIN');
      // Determine orgId from current user
      const userId = (req.session as any)?.userId as string | undefined;
      let orgId: string | undefined;
      if (userId) {
        const r = await db.select({ orgId: users.orgId }).from(users).where(eq(users.id, userId));
        orgId = r[0]?.orgId as string | undefined;
      }
      if (!orgId) {
        await pg.query('ROLLBACK');
        return res.status(400).json({ error: 'Organization could not be resolved for user' });
      }

      for (const raw of records) {
        const parsed = ImportRowSchema.safeParse({
          sku: raw.sku,
          barcode: raw.barcode || null,
          name: raw.name,
          cost_price: raw.cost_price || raw.costPrice,
          sale_price: raw.sale_price || raw.salePrice,
          vat_rate: raw.vat_rate || raw.vatRate || '0',
          reorder_level: raw.reorder_level || raw.reorderLevel || '0',
          initial_quantity: raw.initial_quantity || raw.initialQuantity || '0',
          store_id: raw.store_id || raw.storeId,
          store_code: raw.store_code,
        });
        if (!parsed.success) {
          invalidRows.push({ row: raw, error: parsed.error.errors.map(e => e.message).join('; ') });
          continue;
        }
        const r = parsed.data;

        // Resolve storeId
        let storeId: string | undefined = r.store_id as any;
        if (!storeId && r.store_code) {
          const sr = await db.select().from(stores).where(eq(stores.name as any, r.store_code)).limit(1);
          storeId = (sr as any)[0]?.id;
        }
        if (!storeId) {
          invalidRows.push({ row: raw, error: 'store_id or valid store_code required' });
          continue;
        }

        // Upsert product by (orgId, sku)
        const existing = await db.select().from(products).where(and(eq(products.orgId as any, orgId as any), eq(products.sku as any, r.sku))).limit(1);
        let productId: string;
        if ((existing as any)[0]) {
          const p = (existing as any)[0];
          await db.execute(sql`UPDATE products SET barcode = ${r.barcode}, name = ${r.name}, cost_price = ${r.cost_price}, sale_price = ${r.sale_price}, vat_rate = ${r.vat_rate} WHERE id = ${p.id}`);
          productId = p.id;
        } else {
          const inserted = await db.execute(sql`INSERT INTO products (org_id, sku, barcode, name, cost_price, sale_price, vat_rate)
             VALUES (${orgId}, ${r.sku}, ${r.barcode}, ${r.name}, ${r.cost_price}, ${r.sale_price}, ${r.vat_rate}) RETURNING id`);
          productId = (inserted as any).rows[0].id;
        }

        // Ensure inventory row exists per store/product and set quantity
        await db.execute(sql`INSERT INTO inventory (store_id, product_id, quantity, reorder_level)
           VALUES (${storeId}, ${productId}, ${Number(r.initial_quantity)}, ${Number(r.reorder_level)})
           ON CONFLICT (store_id, product_id)
           DO UPDATE SET quantity = EXCLUDED.quantity, reorder_level = EXCLUDED.reorder_level`);
        results.push({ sku: r.sku, productId });
      }
      await pg.query('COMMIT');
    } catch (e: any) {
      await pg.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to import inventory' });
    } finally {
      pg.release();
    }

    res.status(200).json({ imported: results.length, invalid: invalidRows.length, invalidRows });
  });
}


