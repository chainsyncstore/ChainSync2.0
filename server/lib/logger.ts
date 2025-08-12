import { Request, Response } from 'express';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace'
}

export interface LogContext {
  userId?: string;
  storeId?: string;
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

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    return logEntry;
  }

  private outputLog(logEntry: LogEntry): void {
    if (this.isDevelopment) {
      // Development: Pretty console output
      const colorMap = {
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.WARN]: '\x1b[33m',  // Yellow
        [LogLevel.INFO]: '\x1b[36m',  // Cyan
        [LogLevel.DEBUG]: '\x1b[35m', // Magenta
        [LogLevel.TRACE]: '\x1b[37m'  // White
      };
      const reset = '\x1b[0m';
      
      console.log(
        `${colorMap[logEntry.level]}[${logEntry.level.toUpperCase()}]${reset} ${logEntry.timestamp} - ${logEntry.message}`,
        logEntry.context ? JSON.stringify(logEntry.context, null, 2) : '',
        logEntry.error ? `\nError: ${logEntry.error.message}\nStack: ${logEntry.error.stack}` : ''
      );
    } else {
      // Production: Structured JSON logging
      console.log(JSON.stringify(logEntry));
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const logEntry = this.formatLog(LogLevel.ERROR, message, context, error);
      this.outputLog(logEntry);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const logEntry = this.formatLog(LogLevel.WARN, message, context);
      this.outputLog(logEntry);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const logEntry = this.formatLog(LogLevel.INFO, message, context);
      this.outputLog(logEntry);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const logEntry = this.formatLog(LogLevel.DEBUG, message, context);
      this.outputLog(logEntry);
    }
  }

  trace(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      const logEntry = this.formatLog(LogLevel.TRACE, message, context);
      this.outputLog(logEntry);
    }
  }

  // Specialized logging methods for key events
  logAuthEvent(event: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'signup_attempt' | 'signup_duplicate' | 'verification_failed' | 'verification_success' | 'suspicious_activity', context: LogContext): void {
    this.info(`Authentication event: ${event}`, context);
  }

  logTransactionEvent(event: 'created' | 'completed' | 'voided' | 'refunded', context: LogContext): void {
    this.info(`Transaction event: ${event}`, context);
  }

  logInventoryEvent(event: 'stock_adjusted' | 'low_stock_alert' | 'product_added' | 'product_updated', context: LogContext): void {
    this.info(`Inventory event: ${event}`, context);
  }

  logPaymentEvent(event: 'initiated' | 'completed' | 'failed' | 'webhook_received', context: LogContext): void {
    this.info(`Payment event: ${event}`, context);
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
      userId: (req.session as any)?.user?.id,
      storeId: (req.session as any)?.user?.storeId
    };

    if (res.statusCode >= 400) {
      this.error(`HTTP ${req.method} ${req.path} - ${res.statusCode}`, context);
    } else {
      this.info(`HTTP ${req.method} ${req.path} - ${res.statusCode}`, context);
    }
  }
}

export const logger = new Logger();

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
  return {
    userId: (req.session as any)?.user?.id,
    storeId: (req.session as any)?.user?.storeId,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...additionalContext
  };
}; 