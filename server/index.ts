import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { sendErrorResponse, AppError, isOperationalError } from "./lib/errors";
import { logger, requestLogger } from "./lib/logger";
import { monitoringService, monitoringMiddleware } from "./lib/monitoring";
import { 
  helmetConfig, 
  corsMiddleware, 
  globalRateLimit, 
  securityHeaders, 
  ipWhitelistCheck, 
  securityLogging,
  redirectSecurityCheck
} from "./middleware/security";

const app = express();

// Trust proxy for proper IP handling behind load balancers (important for Render)
app.set('trust proxy', true);

// Security middleware (order is important)
app.use(helmetConfig);
app.use(globalRateLimit);
app.use(securityHeaders);
app.use(ipWhitelistCheck);
app.use(securityLogging);
app.use(redirectSecurityCheck);

// CORS middleware - apply after other security middleware but before routes
app.use(corsMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Add monitoring and logging middleware
app.use(monitoringMiddleware);
app.use(requestLogger);

(async () => {
  try {
    logger.info('Starting server initialization...', {
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
      cwd: process.cwd()
    });

    const server = await registerRoutes(app);

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

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    logger.info('Starting server on port...', { port });
    
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
