import express, { type Express, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { subscriptions, organizations } from '@shared/prd-schema';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

function verifyPaystackSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.WEBHOOK_SECRET_PAYSTACK || '';
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

function verifyFlutterwaveSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.WEBHOOK_SECRET_FLW || '';
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return hash === signature;
}

export async function registerWebhookRoutes(app: Express) {
  // Health pings for debugging
  app.get('/webhooks/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  app.get('/api/payment/ping', (_req: Request, res: Response) => res.json({ ok: true }));
  // Shared handler implementations
  const paystackHandler = async (req: Request, res: Response) => {
    let raw = (req as any).body instanceof Buffer ? (req as any).body.toString('utf8') : '';
    if (!raw || raw.length === 0) {
      try { raw = JSON.stringify((req as any).body || {}); } catch { raw = ''; }
    }
    const ok = verifyPaystackSignature(raw, req.headers['x-paystack-signature'] as string | undefined);
    if (!ok) return res.status(401).json({ error: 'Invalid signature' });
    try {
      const evt = JSON.parse(raw);
      const { data } = evt;
      // Expect metadata with orgId and planCode
      const orgId = data?.metadata?.orgId as string | undefined;
      const planCode = data?.metadata?.planCode as string | undefined;
      if (!orgId || !planCode) return res.status(400).json({ error: 'Missing metadata' });

      const rows = await db.select().from(organizations).where(eq(organizations.id, orgId));
      if (!rows[0]) return res.status(404).json({ error: 'Org not found' });

      const status = (data?.status === 'success') ? 'ACTIVE' : (data?.status === 'failed' ? 'CANCELLED' : 'PAST_DUE');

      // Upsert by (orgId)
      const existing = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
      if (existing[0]) {
        await db.update(subscriptions).set({
          planCode,
          provider: 'PAYSTACK' as any,
          status: status as any,
          lastEventRaw: evt as any,
          updatedAt: new Date() as any,
        } as any).where(eq(subscriptions.orgId, orgId));
      } else {
        await db.insert(subscriptions).values({
          orgId,
          planCode,
          provider: 'PAYSTACK' as any,
          status: status as any,
          lastEventRaw: evt as any,
        } as any);
      }

      // Activate or lock org based on status
      if (status === 'ACTIVE') {
        await db.execute(sql`UPDATE organizations SET is_active = true, locked_until = NULL WHERE id = ${orgId}`);
      } else if (status === 'PAST_DUE') {
        const grace = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await db.execute(sql`UPDATE organizations SET locked_until = ${grace} WHERE id = ${orgId}`);
      } else if (status === 'CANCELLED') {
        await db.execute(sql`UPDATE organizations SET is_active = false WHERE id = ${orgId}`);
      }

      return res.json({ received: true });
    } catch {
      return res.status(400).json({ error: 'Invalid payload' });
    }
  };

  const flutterwaveHandler = async (req: Request, res: Response) => {
    let raw = (req as any).body instanceof Buffer ? (req as any).body.toString('utf8') : '';
    if (!raw || raw.length === 0) {
      try { raw = JSON.stringify((req as any).body || {}); } catch { raw = ''; }
    }
    const ok = verifyFlutterwaveSignature(raw, req.headers['verif-hash'] as string | undefined);
    if (!ok) return res.status(401).json({ error: 'Invalid signature' });
    try {
      const evt = JSON.parse(raw);
      const data = evt?.data;
      const orgId = data?.meta?.orgId as string | undefined;
      const planCode = data?.meta?.planCode as string | undefined;
      if (!orgId || !planCode) return res.status(400).json({ error: 'Missing metadata' });

      const rows = await db.select().from(organizations).where(eq(organizations.id, orgId));
      if (!rows[0]) return res.status(404).json({ error: 'Org not found' });

      const status = (data?.status === 'successful') ? 'ACTIVE' : (data?.status === 'failed' ? 'CANCELLED' : 'PAST_DUE');

      const existing = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
      if (existing[0]) {
        await db.update(subscriptions).set({
          planCode,
          provider: 'FLW' as any,
          status: status as any,
          lastEventRaw: evt as any,
          updatedAt: new Date() as any,
        } as any).where(eq(subscriptions.orgId, orgId));
      } else {
        await db.insert(subscriptions).values({
          orgId,
          planCode,
          provider: 'FLW' as any,
          status: status as any,
          lastEventRaw: evt as any,
        } as any);
      }

      if (status === 'ACTIVE') {
        await db.execute(sql`UPDATE organizations SET is_active = true, locked_until = NULL WHERE id = ${orgId}`);
      } else if (status === 'PAST_DUE') {
        const grace = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await db.execute(sql`UPDATE organizations SET locked_until = ${grace} WHERE id = ${orgId}`);
      } else if (status === 'CANCELLED') {
        await db.execute(sql`UPDATE organizations SET is_active = false WHERE id = ${orgId}`);
      }

      return res.json({ received: true });
    } catch {
      return res.status(400).json({ error: 'Invalid payload' });
    }
  };

  // Paystack: mount both primary and legacy paths
  app.post('/webhooks/paystack', express.raw({ type: '*/*' }), paystackHandler);
  app.post('/api/payment/paystack-webhook', express.raw({ type: '*/*' }), paystackHandler);

  // Flutterwave
  app.post('/webhooks/flutterwave', express.raw({ type: '*/*' }), flutterwaveHandler);
  app.post('/api/payment/flutterwave-webhook', express.raw({ type: '*/*' }), flutterwaveHandler);
}


