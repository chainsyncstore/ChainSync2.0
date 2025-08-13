import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { logger } from "../lib/logger";

// CORS configuration for API routes only
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // In production, allow requests with no origin for certain cases (like service workers, direct API calls)
    if (process.env.NODE_ENV === 'production' && !origin) {
      logger.info('Allowing request with no origin in production (likely service worker or direct API call)', { 
        environment: process.env.NODE_ENV 
      });
      return callback(null, true);
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
      
      // Always allow requests from chainsync.store domain (hardcoded for reliability)
      allowedOrigins.push('https://chainsync.store');
      allowedOrigins.push('https://www.chainsync.store');
      
      // Always allow requests from the same domain (for same-origin requests)
      if (origin && origin.includes('chainsync.store')) {
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
      
      // Special handling for chainsync.store domain
      if (process.env.NODE_ENV === 'production' && origin && origin.includes('chainsync.store')) {
        logger.info('Allowing chainsync.store domain origin', { origin });
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
  // Fix trust proxy issue by using the proper ipKeyGenerator helper for IPv6 support
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available, otherwise use ipKeyGenerator
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const firstIP = forwardedFor.toString().split(',')[0].trim();
      return firstIP || ipKeyGenerator(req) || 'unknown';
    }
    return ipKeyGenerator(req) || 'unknown';
  },
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
  // Fix trust proxy issue by using the proper ipKeyGenerator helper for IPv6 support
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available, otherwise use ipKeyGenerator
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const firstIP = forwardedFor.toString().split(',')[0].trim();
      return firstIP || ipKeyGenerator(req) || 'unknown';
    }
    return ipKeyGenerator(req) || 'unknown';
  },
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
  // Fix trust proxy issue by using the proper ipKeyGenerator helper for IPv6 support
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available, otherwise use ipKeyGenerator
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const firstIP = forwardedFor.toString().split(',')[0].trim();
      return firstIP || ipKeyGenerator(req) || 'unknown';
    }
    return ipKeyGenerator(req) || 'unknown';
  },
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
  // Fix trust proxy issue by using the proper ipKeyGenerator helper for IPv6 support
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available, otherwise use ipKeyGenerator
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const firstIP = forwardedFor.toString().split(',')[0].trim();
      return firstIP || ipKeyGenerator(req) || 'unknown';
    }
    return ipKeyGenerator(req) || 'unknown';
  },
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
  
  // Custom CSRF validation
  const csrfToken = req.headers['x-csrf-token'] as string;
  const cookieToken = req.cookies['csrf-token'];
  
  if (!csrfToken || !cookieToken) {
    return res.status(403).json({
      error: 'CSRF token missing',
      message: 'CSRF token is required for this request'
    });
  }
  
  if (csrfToken !== cookieToken) {
    return res.status(403).json({
      error: 'CSRF token invalid',
      message: 'CSRF token validation failed'
    });
  }
  
  // CSRF validation passed
  next();
};

// CSRF error handler
export const csrfErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // This is now handled by the custom CSRF validation middleware
  // Keep for backward compatibility but it should not be called
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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://replit.com", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
      connectSrc: ["'self'", "https://api.openai.com", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net", "https://www.google.com/recaptcha/api2/clr"],
      frameSrc: ["'self'", "https://www.google.com", "https://www.gstatic.com", "https://www.recaptcha.net"],
      workerSrc: ["'self'", "blob:"],
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
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  
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
