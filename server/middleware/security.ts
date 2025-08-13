import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import csrf from "csurf";
import { logger } from "../lib/logger";

// CORS configuration for API routes only
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // In production, never allow requests with no origin
    if (process.env.NODE_ENV === 'production' && !origin) {
      logger.warn('CORS blocked request with no origin in production', { 
        environment: process.env.NODE_ENV 
      });
      return callback(new Error('Origin required in production'));
    }
    
    // In development, allow requests with no origin for testing
    if (process.env.NODE_ENV === 'development' && !origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // Alternative dev port
      'http://localhost:5000', // Server port
    ];
    
    // Add production domains only if they are explicitly configured
    if (process.env.NODE_ENV === 'production') {
      if (process.env.PRODUCTION_DOMAIN) {
        allowedOrigins.push(process.env.PRODUCTION_DOMAIN);
      }
      if (process.env.PRODUCTION_WWW_DOMAIN) {
        allowedOrigins.push(process.env.PRODUCTION_WWW_DOMAIN);
      }
      
      // Add Render-specific domains for deployment
      if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        allowedOrigins.push(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
      }
      if (process.env.RENDER_EXTERNAL_URL) {
        allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
      }
      
      // Add common Render deployment patterns
      allowedOrigins.push('https://*.onrender.com');
      allowedOrigins.push('https://*.render.com');
      
      // Add the current request origin if it's a Render domain
      if (origin && (origin.includes('onrender.com') || origin.includes('render.com'))) {
        allowedOrigins.push(origin);
      }
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin!)) {
      callback(null, true);
    } else {
      // Special handling for Render deployments
      if (process.env.NODE_ENV === 'production' && origin && 
          (origin.includes('onrender.com') || origin.includes('render.com'))) {
        logger.info('Allowing Render deployment origin', { origin });
        return callback(null, true);
      }
      
      logger.warn('CORS blocked request from unauthorized origin', { 
        origin, 
        allowedOrigins,
        environment: process.env.NODE_ENV 
      });
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

// Sensitive endpoints rate limiting (5 requests per minute)
export const sensitiveEndpointRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per minute
  message: {
    error: 'Too many requests to sensitive endpoint, please try again later.',
    retryAfter: Math.ceil(60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Sensitive endpoint rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many requests to sensitive endpoint, please try again later.',
      retryAfter: Math.ceil(60 / 60)
    });
  },
  // Don't skip successful requests for sensitive endpoints
  skipSuccessfulRequests: false
});

// Payment-specific rate limiting (3 requests per minute)
export const paymentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each IP to 3 payment requests per minute
  message: {
    error: 'Too many payment attempts, please try again later.',
    retryAfter: Math.ceil(60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Payment rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many payment attempts, please try again later.',
      retryAfter: Math.ceil(60 / 60)
    });
  },
  // Don't skip successful requests for payment endpoints
  skipSuccessfulRequests: false
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
    sessionKey: 'chainsync.sid'
  })(req, res, next);
};

// CSRF error handler
export const csrfErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    const userId = (req.session as any)?.user?.id;
    
    logger.logFailedCSRFCheck(ipAddress!, req.path, userAgent, userId);
    
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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://replit.com"],
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

// CORS middleware - only apply to API routes
export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip CORS for static files and non-API routes
  if (req.path.startsWith('/assets/') || 
      req.path.startsWith('/static/') || 
      req.path.includes('.') || 
      !req.path.startsWith('/api/')) {
    return next();
  }
  
  // Apply CORS only to API routes
  return cors(corsOptions)(req, res, next);
};

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

// Middleware to detect and log suspicious redirect URLs
export const redirectSecurityCheck = (req: Request, res: Response, next: NextFunction) => {
  const redirectUrl = req.query.redirect || req.query.returnTo || req.query.next;
  
  if (redirectUrl && typeof redirectUrl === 'string') {
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent');
    const userId = (req.session as any)?.user?.id;
    
    // Check if redirect URL is suspicious (external domains, javascript: protocol, etc.)
    try {
      const url = new URL(redirectUrl, process.env.BASE_URL || 'http://localhost:3000');
      
      // Log suspicious redirects
      if (url.protocol === 'javascript:' || 
          url.protocol === 'data:' ||
          url.protocol === 'vbscript:' ||
          !url.hostname.includes('chainsync.store') && 
          !url.hostname.includes('localhost') &&
          !url.hostname.includes('127.0.0.1')) {
        
        logger.logSuspiciousRedirect(redirectUrl, ipAddress!, userAgent, userId);
      }
    } catch (error) {
      // Invalid URL format - log as suspicious
      logger.logSuspiciousRedirect(redirectUrl, ipAddress!, userAgent, userId);
    }
  }
  
  next();
};
