import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import pino, { Logger as PinoLogger } from 'pino';
import pinoHttp from 'pino-http';
// Use CommonJS __filename for compatibility with Jest/ts-jest
// import { createRequire } from 'module';
const createRequire = typeof require !== 'undefined' ? require : undefined;

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
} as const;

export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];

export interface LogContext {
  userId?: string;
  storeId?: string;
  orgId?: string;
  transactionId?: string;
  productId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  stack?: string;
}

class Logger {
  private logLevel: LogLevel;
  private isDevelopment: boolean;
  private pino: PinoLogger;

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || LOG_LEVELS.INFO;
    this.isDevelopment = process.env.NODE_ENV === 'development';

    const pinoLevel = (process.env.LOG_LEVEL || 'info') as any;
    const base: Record<string, any> = {
      service: 'chainsync-server',
      env: process.env.NODE_ENV,
    };

    // Enable pretty logs in development only if pino-pretty is available
    let hasPretty = false;
    if (this.isDevelopment && createRequire) {
      try {
        createRequire.resolve('pino-pretty');
        hasPretty = true;
      } catch {
        hasPretty = false;
      }
    }

    this.pino = pino({
      level: pinoLevel,
      base,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({ pid: bindings.pid, hostname: bindings.hostname }),
      },
      transport: this.isDevelopment && hasPretty
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
          }
        : undefined,
    });

    if (process.env.SENTRY_DSN) {
      try {
        const rawDsn = String(process.env.SENTRY_DSN).trim();
        const looksLikePlaceholder = /your[_-]?sentry|your_sentry_dsn_here|example_sentry/i.test(rawDsn) || rawDsn.length === 0;
        if (looksLikePlaceholder) {
          console.warn('SENTRY_DSN appears to be a placeholder or invalid; skipping Sentry initialization.');
          delete (process.env as any).SENTRY_DSN;
        } else {
          Sentry.init({
            dsn: rawDsn,
            environment: process.env.NODE_ENV || 'development',
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
          });
        }
      } catch (error) {
        console.warn('Sentry initialization failed (non-fatal):', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LOG_LEVELS);
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        requestId: (context?.requestId as string) || undefined,
        ...context
      },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    return logEntry;
  }

  private outputLog(logEntry: LogEntry): void {
    const { level, message, context, error } = logEntry;
    const payload = { ...context } as any;
    if (error) {
      payload.err = {
        name: (error as any).name,
        message: (error as any).message,
        stack: (error as any).stack,
      };
    }
    switch (level) {
      case LOG_LEVELS.ERROR:
        this.pino.error(payload, message);
        break;
      case LOG_LEVELS.WARN:
        this.pino.warn(payload, message);
        break;
      case LOG_LEVELS.DEBUG:
        this.pino.debug(payload, message);
        break;
      case LOG_LEVELS.TRACE:
        this.pino.trace(payload, message);
        break;
      default:
        this.pino.info(payload, message);
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const logEntry = this.formatLog(LOG_LEVELS.ERROR, message, context, error);
      this.outputLog(logEntry);
      if (process.env.SENTRY_DSN && error) {
        try {
          Sentry.withScope((scope) => {
            if (context) Object.entries(context).forEach(([k, v]) => scope.setTag(k, String(v)));
            scope.setExtra('message', message);
            Sentry.captureException(error);
          });
        } catch (scopeError) {
          this.pino.warn({ scopeError: scopeError instanceof Error ? scopeError.message : scopeError }, 'Failed to capture exception in Sentry');
        }
      }
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      const logEntry = this.formatLog(LOG_LEVELS.WARN, message, context);
      this.outputLog(logEntry);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      const logEntry = this.formatLog(LOG_LEVELS.INFO, message, context);
      this.outputLog(logEntry);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      const logEntry = this.formatLog(LOG_LEVELS.DEBUG, message, context);
      this.outputLog(logEntry);
    }
  }

  trace(message: string, context?: LogContext): void {
    if (this.shouldLog(LOG_LEVELS.TRACE)) {
      const logEntry = this.formatLog(LOG_LEVELS.TRACE, message, context);
      this.outputLog(logEntry);
    }
  }

  // Specialized logging methods for key events
  logAuthEvent(event: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'signup_attempt' | 'signup_duplicate' | 'verification_failed' | 'verification_success' | 'suspicious_activity' | 'login_blocked_email_not_verified' | 'verification_sent', context: LogContext): void {
    this.info(`Authentication event: ${event}`, context);
  }

  logTransactionEvent(event: 'created' | 'completed' | 'voided' | 'refunded', amountOrContext?: number | LogContext, maybeContext?: LogContext): void {
    const amount = typeof amountOrContext === 'number' ? amountOrContext : undefined;
    const context = (typeof amountOrContext === 'object' ? amountOrContext : maybeContext) || {};
    this.info(`Transaction event: ${event}`, { ...context, amount });
  }

  logInventoryEvent(event: 'stock_adjusted' | 'low_stock_alert' | 'product_added' | 'product_updated', context: LogContext): void {
    this.info(`Inventory event: ${event}`, context);
  }

  logPaymentEvent(event: 'initiated' | 'completed' | 'failed' | 'webhook_received' | 'webhook_success', amountOrContext?: number | LogContext, maybeContext?: LogContext): void {
    const amount = typeof amountOrContext === 'number' ? amountOrContext : undefined;
    const context = (typeof amountOrContext === 'object' ? amountOrContext : maybeContext) || {};
    this.info(`Payment event: ${event}`, { ...context, amount });
  }

  logSecurityEvent(event: 'ip_blocked' | 'unauthorized_access' | 'suspicious_activity' | 'csrf_failed' | 'duplicate_signup' | 'failed_verification' | 'suspicious_redirect' | 'rate_limit_exceeded' | 'bot_detected', context: LogContext): void {
    this.warn(`Security event: ${event}`, context);
  }

  // Enhanced security logging for specific auth scenarios
  logDuplicateSignupAttempt(email: string, ipAddress: string, userAgent?: string): void {
    this.logSecurityEvent('duplicate_signup', {
      email,
      ipAddress,
      userAgent,
      timestamp: new Date().toISOString()
    });
  }

  logFailedVerification(userId: string, verificationType: 'email' | 'phone', reason: string, ipAddress?: string): void {
    this.logSecurityEvent('failed_verification', {
      userId,
      verificationType,
      reason,
      ipAddress,
      timestamp: new Date().toISOString()
    });
  }

  logSuspiciousRedirect(url: string, ipAddress: string, userAgent?: string, userId?: string): void {
    this.logSecurityEvent('suspicious_redirect', {
      url,
      ipAddress,
      userAgent,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  logFailedCSRFCheck(ipAddress: string, path: string, userAgent?: string, userId?: string): void {
    this.logSecurityEvent('csrf_failed', {
      ipAddress,
      path,
      userAgent,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  // Request logging middleware
  logRequest(req: Request, res: Response, duration: number): void {
    const context: LogContext = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      userId: (req.session as any)?.user?.id || (req.session as any)?.userId,
      orgId: (req as any).orgId,
      storeId: (req.session as any)?.user?.storeId,
      requestId: (req as any).requestId
    };

    if (res.statusCode >= 400) {
      this.error(`HTTP ${req.method} ${req.path} - ${res.statusCode}`, context);
    } else {
      this.info(`HTTP ${req.method} ${req.path} - ${res.statusCode}`, context);
    }
  }
}

export const logger = new Logger();

// Pino HTTP middleware (optional for direct req.log usage)
export const pinoHttpMiddleware = pinoHttp({
  logger: (logger as any).pino,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.body.password'],
    remove: true,
  },
  customProps: (req) => ({
    requestId: (req as any).requestId,
    userId: (req as any).session?.user?.id || (req as any).session?.userId,
  }),
});

// Middleware for request logging
export const requestLogger = (req: Request, res: Response, next: () => void): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });

  next();
};

// Utility function to extract context from request
export const extractLogContext = (req: Request, additionalContext?: Partial<LogContext>): LogContext => {
  const session = req.session as any;
  const sessionUser = session?.user;
  const fallbackUserId = session?.userId;
  const fallbackStoreId = session?.storeId;
  const fallbackOrgId = session?.orgId;

  return {
    userId: sessionUser?.id ?? fallbackUserId,
    storeId: sessionUser?.storeId ?? fallbackStoreId,
    orgId: sessionUser?.orgId ?? fallbackOrgId ?? (req as any).orgId,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...additionalContext,
  };
};