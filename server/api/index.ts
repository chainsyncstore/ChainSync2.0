import type { Express } from 'express';
import { createServer } from 'http';
import { configureSession } from '../session';
import { loadEnv } from '../../shared/env';
import { registerAuthRoutes } from './routes.auth';
import { registerInventoryRoutes } from './routes.inventory';
import { registerPosRoutes } from './routes.pos';
import { registerAnalyticsRoutes } from './routes.analytics';
import { registerMeRoutes } from './routes.me';
import { auditMiddleware } from '../middleware/validation';

export async function registerRoutes(app: Express) {
  const env = loadEnv(process.env);

  // Sessions (Redis-backed)
  app.use(configureSession(env.REDIS_URL, env.SESSION_SECRET));
  // Global audit for non-GET
  app.use(auditMiddleware());

  // Healthcheck
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, uptime: process.uptime() });
  });

  // API routes
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerInventoryRoutes(app);
  await registerPosRoutes(app);
  await registerAnalyticsRoutes(app);

  return createServer(app);
}


