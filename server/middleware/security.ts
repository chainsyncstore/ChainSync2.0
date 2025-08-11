import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import csrf from "csurf";
import { logger } from "../lib/logger";

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5000',
      'https://chainsync.app',
      'https://www.chainsync.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['X-CSRF-Token'],
  maxAge: 86400 // 24 hours
};

// Global rate limiting (200 requests per 15 minutes)
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(15 * 60 / 60) // minutes
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(15 * 60 / 60)
    });
  }
});

// Auth-specific rate limiting (10 requests per 10 minutes)
export const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(10 * 60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(10 * 60 / 60)
    });
  },
  // Skip rate limiting for successful logins
  skipSuccessfulRequests: true
});

// CSRF protection configuration
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF validation for static files and root path
  if (req.path === '/' || 
      req.path === '/favicon.ico' || 
      req.path.startsWith('/static') || 
      req.path.startsWith('/assets') ||
      req.method === 'GET' || 
      req.method === 'HEAD' || 
      req.method === 'OPTIONS') {
    return next();
  }
  
  // Apply CSRF protection for other routes
  return csrf({
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    sessionKey: 'session'
  })(req, res, next);
};

// CSRF error handler
export const csrfErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    logger.warn('CSRF token validation failed', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'Invalid or missing CSRF token'
    });
  }
  next(err);
};

// Helmet configuration with CSP
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.openai.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  xssFilter: true
});

// CORS middleware
export const corsMiddleware = cors(corsOptions);

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

// IP whitelist middleware (if needed)
export const ipWhitelistCheck = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Skip IP check for development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  // Add your IP whitelist logic here if needed
  // For now, we'll just log the IP
  logger.debug('Client IP', { ip: clientIP, path: req.path });
  
  next();
};

// Request logging for security monitoring
export const securityLogging = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log request details for security monitoring
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    timestamp: new Date().toISOString()
  });
  
  // Log response details
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
  });
  
  next();
};
