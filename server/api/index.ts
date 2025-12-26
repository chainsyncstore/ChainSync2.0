import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { loadEnv } from '../../shared/env';
import { getEmailHealth } from '../email';
import { logger } from '../lib/logger';
import { registerNotificationService } from '../lib/notification-bus';
import { csrfProtection, globalRateLimit, sensitiveEndpointRateLimit } from '../middleware/security';

import { configureSession } from '../session';
import { NotificationService } from '../websocket/notification-service';
import { registerAdminRoutes } from './routes.admin';
import { registerAlertsRoutes } from './routes.alerts';
import { registerAnalyticsRoutes } from './routes.analytics';
import { registerAnalyticsV2Routes, registerAnalyticsV2RoutesExtra } from './routes.analytics-v2';
import { registerAuthRoutes } from './routes.auth';
import { registerBillingRoutes } from './routes.billing';
import { registerComprehensiveReportRoutes } from './routes.comprehensive-report';
import { registerCustomerRoutes } from './routes.customers';
import { registerExportRoutes } from './routes.export';
import { registerGeolocationRoutes } from './routes.geolocation';
import { registerInventoryRoutes } from './routes.inventory';
import { registerIpWhitelistRoutes } from './routes.ip-whitelist';
import { registerLoyaltyRoutes } from './routes.loyalty';
import { registerMeRoutes } from './routes.me';
import { registerPaymentRoutes } from './routes.payment';
import { registerPosRoutes } from './routes.pos';
import { registerPromotionRoutes } from './routes.promotions';
import { registerSettingsRoutes } from './routes.settings';
import { registerStoreStaffRoutes } from './routes.store-staff';
import { registerStoreRoutes } from './routes.stores';
import { registerWebhookRoutes } from './routes.webhooks';

export async function registerRoutes(app: Express) {
  const env = loadEnv(process.env);

  // Sessions (Redis-backed; allow local bypass with LOCAL_DISABLE_REDIS)
  const resolvedRedisUrl = process.env.LOCAL_DISABLE_REDIS === 'true' ? undefined : env.REDIS_URL;
  app.use(configureSession(resolvedRedisUrl, env.SESSION_SECRET));
  // Cookie parser required before CSRF
  app.use(cookieParser());
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

  // Healthcheck
  app.get('/healthz', (_req, res) => {
    const email = getEmailHealth();
    res.status(200).json({ ok: true, uptime: process.uptime(), email });
  });

  // API routes
  await registerAdminRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerAnalyticsV2Routes(app);
  await registerAnalyticsV2RoutesExtra(app);
  await registerComprehensiveReportRoutes(app);
  await registerAlertsRoutes(app);
  await registerAuthRoutes(app);
  await registerBillingRoutes(app);
  await registerCustomerRoutes(app);
  await registerInventoryRoutes(app);
  await registerIpWhitelistRoutes(app);
  await registerLoyaltyRoutes(app);
  await registerMeRoutes(app);
  await registerPaymentRoutes(app);
  await registerPosRoutes(app);
  await registerPromotionRoutes(app);
  await registerSettingsRoutes(app);
  await registerExportRoutes(app);
  await registerStoreRoutes(app);
  await registerStoreStaffRoutes(app);
  await registerWebhookRoutes(app);
  registerGeolocationRoutes(app);

  // Test-only utility routes
  try {
    const { registerTestRoutes } = await import('./routes.test');
    await registerTestRoutes(app);
  } catch (error) {
    logger.warn('Test routes unavailable; continuing without them', {
      error: error instanceof Error ? error.message : String(error)
    });
  }


  // Phase 8: Enhanced Observability Routes (best-effort)
  try {
    const { registerObservabilityRoutes } = await import('./routes.observability');
    await registerObservabilityRoutes(app);
  } catch (error) {
    logger.warn('Observability routes unavailable; continuing without them', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // AI Profit Advisor Routes
  try {
    const { registerAIInsightsRoutes } = await import('./routes.ai-insights');
    await registerAIInsightsRoutes(app);
  } catch (error) {
    logger.warn('AI insights routes unavailable or failed to register', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // AI Chat Routes
  try {
    const { registerAIChatRoutes } = await import('./routes.ai-chat');
    await registerAIChatRoutes(app);
  } catch (error) {
    logger.warn('AI chat routes unavailable or failed to register', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Phase 8: Offline Sync Routes (best-effort)
  try {
    const { registerOfflineSyncRoutes } = await import('./routes.offline-sync');
    await registerOfflineSyncRoutes(app);
  } catch (error) {
    logger.warn('Offline sync routes unavailable; continuing without them', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  app.get('/api/billing/plans', (_req, res) => {
    res.json({ ok: true });
  });

  // Final API 404 handler for unmatched routes (must be last API route)
  app.all('/api/*', (req, res) => {
    return res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      message: 'The requested API endpoint could not be found'
    });
  });

  const server = createServer(app);
  // Attach websocket notification service
  try {
    const wsService = new NotificationService(server);
    (app as any).wsService = wsService;
    registerNotificationService(wsService);
  } catch (error) {
    logger.warn('Failed to initialize websocket notification service', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return server;
}


