import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { products, inventory, stores } from '@shared/prd-schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export async function registerInventoryRoutes(app: Express) {
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
  app.post('/api/inventory/products', async (req: Request, res: Response) => {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
    const created = await db.insert(products).values(parsed.data as any).returning();
    res.json(created[0]);
  });

  // CSV template download
  app.get('/api/inventory/template.csv', (_req: Request, res: Response) => {
    const file = path.resolve(process.cwd(), 'scripts/csv-templates/inventory_import_template.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    fs.createReadStream(file).pipe(res);
  });
}


