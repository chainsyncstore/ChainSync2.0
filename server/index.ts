import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./api";
import { setupVite, serveStatic, log } from "./vite";
import { loadEnv } from "../shared/env";
import { sendErrorResponse, AppError, isOperationalError } from "./lib/errors";
import { logger, requestLogger, pinoHttpMiddleware } from "./lib/logger";
import { monitoringService, monitoringMiddleware } from "./lib/monitoring";
import { 
  helmetConfig, 
  corsMiddleware, 
  securityHeaders, 
  ipWhitelistCheck, 
  securityLogging,
  redirectSecurityCheck
} from "./middleware/security";
import { scheduleAbandonedSignupCleanup, scheduleNightlyLowStockAlerts, scheduleSubscriptionReconciliation, scheduleDunning } from "./jobs/cleanup";
// WebSocket service will be set up after core APIs are migrated to PRD schema

const app = express();

// Trust proxy for proper IP handling behind load balancers (Cloudflare/Render)
// TRUST_PROXY can be set to a number (hops), 'true', or 'false'. Defaults to 1 in production, true otherwise.
(() => {
  const envVal = process.env.TRUST_PROXY;
  let trust: any = (process.env.NODE_ENV === 'production') ? 1 : true;
  if (typeof envVal === 'string') {
    if (envVal.toLowerCase() === 'true') trust = true;
    else if (envVal.toLowerCase() === 'false') trust = false;
    else {
      const n = parseInt(envVal, 10);
      if (!Number.isNaN(n)) trust = n;
    }
  }
  app.set('trust proxy', trust);
})();

// Request ID middleware for log correlation
app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = (req.headers['x-request-id'] as string) || (req as any).id;
  const requestId = existing || Math.random().toString(36).slice(2) + Date.now().toString(36);
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Security middleware (order is important)
app.use(helmetConfig);
app.use(securityHeaders);
app.use(ipWhitelistCheck);
app.use(securityLogging);
app.use(redirectSecurityCheck);

// CORS middleware - apply after other security middleware but before routes
app.use(corsMiddleware);

// Body parsing middleware
const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: false, limit: '10mb' });
const isWebhookPost = (req: Request) => (
  req.method === 'POST' && (
    req.path.startsWith('/webhooks/') ||
    req.path.startsWith('/api/webhook/') ||
    (req.path.startsWith('/api/payment') && req.path.includes('webhook'))
  )
);
app.use((req, res, next) => isWebhookPost(req) ? next() : jsonParser(req, res, next));
app.use((req, res, next) => isWebhookPost(req) ? next() : urlencodedParser(req, res, next));

// Add monitoring and logging middleware
app.use(monitoringMiddleware);
app.use(pinoHttpMiddleware);
app.use(requestLogger);

(async () => {
  try {
    logger.info('Starting server initialization...', {
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
      cwd: process.cwd()
    });

    // Startup validations: detect obvious placeholder env values and warn early.
    try {
      const rawSentry = String(process.env.SENTRY_DSN || '').trim();
      if (rawSentry && /your[_-]?sentry|your_sentry_dsn_here|example_sentry/i.test(rawSentry)) {
        logger.warn('SENTRY_DSN appears to be a placeholder; ignoring for this run. Update your production env to a valid DSN to enable Sentry.');
        try { delete (process.env as any).SENTRY_DSN; } catch {}
      }
    } catch (e) {
      // ignore
    }

    // Validate env early
    loadEnv(process.env);
    const server = await registerRoutes(app);

    // WebSocket init moved to PRD-compliant implementation

    // Kick off non-blocking SMTP verification; do not block startup
    (async () => {
      try {
        const { verifyEmailTransporter } = await import('./email');
        const ok = await verifyEmailTransporter();
        if (!ok) {
          logger.error('SMTP transporter verification failed. Emails will not be sent.');
        } else {
          logger.info('SMTP transporter verified successfully.');
        }
      } catch (e) {
        logger.error('Failed to verify SMTP transporter', { error: e instanceof Error ? e.message : String(e) });
      }
    })();

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      logger.info('Setting up Vite development server...');
      await setupVite(app, server);
    } else {
      logger.info('Setting up static file serving...');
      serveStatic(app);
    }

    // Error handling middleware - set up AFTER static file serving
    // to avoid interfering with static file requests
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      // Log the error with structured logging
      logger.error('Unhandled error occurred', {
        path: _req.path,
        method: _req.method,
        statusCode: err.statusCode || err.status,
        code: err.code
      }, err);

      // Handle static asset errors more gracefully
      if (_req.path.startsWith('/assets/')) {
        return res.status(404).json({
          error: 'Asset not found',
          path: _req.path,
          message: 'The requested asset could not be found'
        });
      }

      // Send standardized error response
      sendErrorResponse(res, err, _req.path);

      // Only re-throw non-operational errors in development
      if (app.get("env") === "development" && !isOperationalError(err)) {
        throw err;
      }
    });

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    logger.info('Starting server on port...', { port });
    
    // Schedule daily cleanup of abandoned signups
    scheduleAbandonedSignupCleanup();
    // Schedule nightly low stock alerts generation
    scheduleNightlyLowStockAlerts();
    // Schedule daily subscription reconciliation
    scheduleSubscriptionReconciliation();
    // Schedule daily dunning notices
    scheduleDunning();

    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      logger.info(`Server started successfully`, {
        port,
        environment: app.get("env"),
        nodeVersion: process.version
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
})();

export default app;
