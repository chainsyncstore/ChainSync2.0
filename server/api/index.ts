import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { configureSession } from '../session';
import { loadEnv } from '../../shared/env';
import { getEmailHealth } from '../email';
import { registerAuthRoutes } from './routes.auth';
import { registerInventoryRoutes } from './routes.inventory';
import { registerPosRoutes } from './routes.pos';
import { registerAnalyticsRoutes } from './routes.analytics';
import { registerAdminRoutes } from './routes.admin';
import { registerStoreRoutes } from './routes.stores';
import { registerMeRoutes } from './routes.me';
import { registerCustomerRoutes } from './routes.customers';
import { registerLoyaltyRoutes } from './routes.loyalty';
import { registerBillingRoutes } from './routes.billing';
import { registerPaymentRoutes } from './routes.payment';
import { registerWebhookRoutes } from './routes.webhooks';
import { auditMiddleware } from '../middleware/validation';
import rateLimit from 'express-rate-limit';
import { csrfProtection, globalRateLimit, sensitiveEndpointRateLimit } from '../middleware/security';
import { NotificationService } from '../websocket/notification-service';
import { OpenAIService } from '../openai/service';

export async function registerRoutes(app: Express) {
  const env = loadEnv(process.env);

  // Sessions (Redis-backed)
  app.use(configureSession(env.REDIS_URL, env.SESSION_SECRET));
  // Cookie parser required before CSRF
  app.use(cookieParser());
  // Ensure raw body is available for webhooks
  app.use('/webhooks', express.raw({ type: '*/*' }));
  app.use('/api/payment', express.raw({ type: '*/*' }));
  // CSRF protection for API routes (exclude webhooks)
  app.use('/api', csrfProtection);
  // Basic rate limiting on webhook endpoints
  const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 120 });
  app.use('/webhooks', webhookLimiter);
  app.use('/api/payment', webhookLimiter);
  // Protect CSV/PDF exports with rate limiting
  app.use(['/api/export', '/api/**/export'], sensitiveEndpointRateLimit);
  // Global API rate limit after CSRF, before routes
  app.use('/api', globalRateLimit);
  // Global audit for non-GET
  app.use(auditMiddleware());

  // Healthcheck
  app.get('/healthz', (_req, res) => {
    const email = getEmailHealth();
    res.status(200).json({ ok: true, uptime: process.uptime(), email });
  });

  // API routes
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerInventoryRoutes(app);
  await registerStoreRoutes(app);
  await registerCustomerRoutes(app);
  await registerLoyaltyRoutes(app);
  await registerPosRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerAdminRoutes(app);
  await registerBillingRoutes(app);
  await registerPaymentRoutes(app);
  await registerWebhookRoutes(app);

  // Test-only utility routes
  try {
    const { registerTestRoutes } = await import('./routes.test');
    await registerTestRoutes(app);
  } catch {}

  // Final API 404 handler for unmatched routes (all methods)
  app.all('/api/*', (req, res) => {
    return res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      message: 'The requested API endpoint could not be found'
    });
  });

  // OpenAI chat endpoint (ensure available in API router path)
  const openaiService = process.env.NODE_ENV === 'test' ? (null as unknown as OpenAIService) : new OpenAIService();
  app.post('/api/openai/chat', async (req, res) => {
    try {
      const { message, storeId } = req.body || {};
      const openaiResponse = await openaiService.processChatMessage(message, storeId);
      res.json({
        fulfillmentText: openaiResponse.text,
        payload: openaiResponse.payload,
      });
    } catch (error) {
      res.status(500).json({
        fulfillmentText: "I'm sorry, I encountered an error processing your request.",
      });
    }
  });
  
  // Phase 8: Enhanced Observability Routes (best-effort)
  try {
    const { registerObservabilityRoutes } = await import('./routes.observability');
    await registerObservabilityRoutes(app);
  } catch {}

  // Phase 8: AI Analytics Routes (guarded by feature flag)
  try {
    if (process.env.AI_ANALYTICS_ENABLED === 'true') {
      const { registerAIAnalyticsRoutes } = await import('./routes.ai-analytics');
      await registerAIAnalyticsRoutes(app);
    }
  } catch {}

  // Phase 8: Offline Sync Routes (best-effort)
  try {
    const { registerOfflineSyncRoutes } = await import('./routes.offline-sync');
    await registerOfflineSyncRoutes(app);
  } catch {}
  app.get('/api/billing/plans', (_req, res) => {
    res.json({ ok: true });
  });

  const server = createServer(app);
  // Attach websocket notification service
  try {
    const wsService = new NotificationService(server);
    (app as any).wsService = wsService;
  } catch {}
  return server;
}


