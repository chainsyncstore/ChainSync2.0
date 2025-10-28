import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { subscriptions, users, organizations } from '@shared/prd-schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getPlan } from '../lib/plans';
import { PaymentService } from '../payment/service';

const SubscribeSchema = z.object({
  orgId: z.string().uuid(),
  planCode: z.string(),
  email: z.string().email(),
});

export async function registerBillingRoutes(app: Express) {
  app.post('/billing/subscribe', async (req: Request, res: Response) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { orgId, planCode, email } = parsed.data;
    const plan = getPlan(planCode);
    if (!plan) return res.status(400).json({ error: 'Invalid plan code' });

    // Verify org exists
    const orgRows = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const org = orgRows[0];
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const service = new PaymentService();
    // Plan does not carry provider details in typings; derive via env mapping
    const provider = (process.env.DEFAULT_PAYMENT_PROVIDER || 'PAYSTACK') as 'PAYSTACK' | 'FLUTTERWAVE';
    const reference = service.generateReference(provider === 'PAYSTACK' ? 'paystack' : 'flutterwave');
    const callbackUrl = `${process.env.BASE_URL || process.env.APP_URL}/payment/callback?orgId=${orgId}&planCode=${plan.code}`;

    const envKey = `PROVIDER_PLAN_ID_${plan.code.toUpperCase()}`;
    const providerPlanId = process.env[envKey];
    if (!providerPlanId) {
      return res.status(500).json({ error: `Missing provider plan id env: ${envKey}` });
    }

    const resp = provider === 'PAYSTACK'
      ? await service.initializePaystackPayment({
          email,
          amount: Number(process.env[`PLAN_AMOUNT_${plan.code.toUpperCase()}`] || '0'),
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: { orgId, planCode: plan.code },
          providerPlanId,
        })
      : await service.initializeFlutterwavePayment({
          email,
          amount: Number(process.env[`PLAN_AMOUNT_${plan.code.toUpperCase()}`] || '0'),
          currency: 'USD',
          reference,
          callback_url: callbackUrl,
          metadata: { orgId, planCode: plan.code },
          providerPlanId,
        });

    res.json({
      provider,
      reference,
      redirectUrl: resp.data.authorization_url || resp.data.link,
    });
  });
}


