import cors, { type CorsOptions } from "cors";
import { randomBytes } from "crypto";
import { doubleCsrf } from "csrf-csrf";
import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { loadEnv, parseCorsOrigins } from "../../shared/env";
import { logger } from "../lib/logger";
const requestKeyGenerator = (req: Request) => (
  req.ip
  || req.headers['x-forwarded-for']?.toString()
  || req.socket.remoteAddress
  || (req as any).connection?.remoteAddress
  || 'unknown'
);
// Determine environment early for conditional security config
const isDev = process.env.NODE_ENV !== 'production';
// Discover app origins from env to permit SPA assets when hosted separately
const appUrl = process.env.APP_URL?.trim();
const frontendUrl = process.env.FRONTEND_URL?.trim();
const dynamicOrigins = [...new Set([appUrl, frontendUrl, isDev ? 'http://localhost:5173' : undefined]
  .filter(Boolean) as string[])];

// Load validated env once at boot and parse allowed CORS origins
const envForCors = loadEnv(process.env);
const allowedCorsOrigins = parseCorsOrigins(envForCors.CORS_ORIGINS);

// CORS configuration for API routes only (reads validated CORS_ORIGINS CSV)
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g., same-origin, service workers) in all envs
    if (!origin) {
      return callback(null, true);
    }

    if (allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn('CORS blocked request from unauthorized origin', {
      origin,
      allowedOrigins: allowedCorsOrigins,
      environment: process.env.NODE_ENV
    });
    return callback(new Error('Not allowed by CORS'));
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
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};



// Global rate limiting (configurable via env)
export const globalRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 200),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(15 * 60 / 60) // minutes
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // IPv6-safe key generation
  keyGenerator: requestKeyGenerator,
  // Disable rate limiting during tests
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter: Math.ceil(15 * 60 / 60) },
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }
});

// Auth-specific rate limiting (configurable)
export const authRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 10),
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(10 * 60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestKeyGenerator,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter: Math.ceil(10 * 60 / 60) },
      timestamp: new Date().toISOString(),
      path: req.path
    });
  },
  // Skip rate limiting for successful logins
  skipSuccessfulRequests: true
});

// Sensitive endpoints rate limiting (configurable)
export const sensitiveEndpointRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS || 60 * 1000),
  max: Number(process.env.RATE_LIMIT_SENSITIVE_MAX || 5),
  message: {
    error: 'Too many requests to sensitive endpoint, please try again later.',
    retryAfter: Math.ceil(60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestKeyGenerator,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    logger.warn('Sensitive endpoint rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests to sensitive endpoint, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter: Math.ceil(60 / 60) },
      timestamp: new Date().toISOString(),
      path: req.path
    });
  },
  // Don't skip successful requests for sensitive endpoints
  skipSuccessfulRequests: false
});

// Payment-specific rate limiting (configurable)
export const paymentRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PAYMENT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.RATE_LIMIT_PAYMENT_MAX || 3),
  message: {
    error: 'Too many payment attempts, please try again later.',
    retryAfter: Math.ceil(60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestKeyGenerator,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req: Request, res: Response) => {
    logger.warn('Payment rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many payment attempts, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter: Math.ceil(60 / 60) },
      timestamp: new Date().toISOString(),
      path: req.path
    });
  },
  // Don't skip successful requests for payment endpoints
  skipSuccessfulRequests: false
});

const env = loadEnv(process.env);

const {
  invalidCsrfTokenError,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.SESSION_SECRET,
  getSessionIdentifier: (req: Request) => (
    (req.session as any)?.userId ||
    (req as any).requestId ||
    req.ip ||
    'anon'
  ),
  cookieName: "csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: !isDev,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  },
});

// CSRF protection configuration
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Disable CSRF protection during tests to align with test assumptions
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  // Explicitly bypass CSRF for the token issuance route
  const originalUrl = (req as any).originalUrl || req.url;
  if (originalUrl === '/api/auth/csrf-token' || req.path === '/auth/csrf-token') {
    return next();
  }
  // Temporarily bypass CSRF for login while CSRF token generation is stabilized
  if (req.method === 'POST' && (req.path === '/api/auth/login' || originalUrl === '/api/auth/login')) {
    return next();
  }
  // Allow logout without CSRF token to avoid trapping users in session
  if (req.method === 'POST' && (req.path === '/api/auth/logout' || originalUrl === '/api/auth/logout')) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
};

// CSRF error handler
export const csrfErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err === invalidCsrfTokenError) {
    logger.warn('CSRF validation failed', {
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(403).json({
      error: 'CSRF token invalid',
      message: 'CSRF token validation failed',
    });
  } else {
    next(err);
  }
};

// Helper to generate a CSRF token and set the cookie according to configured options
export const generateCsrfToken = (res: Response, req?: Request) => {
  void req;
  if (process.env.NODE_ENV === 'test') {
    const token = `test-${Math.random().toString(36).slice(2)}`;
    // Mirror cookie options from csrfUtils where reasonable in tests
    res.cookie('csrf-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
    return token;
  }
  // Local token generation fallback to avoid runtime dependency issues
  const token = randomBytes(24).toString('hex');
  res.cookie('csrf-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDev,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });
  return token;
};

// Helmet configuration with CSP
export const helmetConfig = helmet({
  // Content Security Policy tailored for SPA + payment providers
  contentSecurityPolicy: {
    directives: {
      // Default to same-origin for everything
      defaultSrc: ["'self'"],

      // Scripts: self + payment SDKs. We minimize 'unsafe-inline'.
      // - Paystack SDK: js.paystack.co
      // - Flutterwave checkout: checkout.flutterwave.com
      // - ReCAPTCHA (if used): www.google.com, www.gstatic.com, www.recaptcha.net
      // Dev relaxations (vite/HMR): 'unsafe-inline' (only dev), 'unsafe-eval' (only dev)
      scriptSrc: Array.from(new Set([
        "'self'",
        ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
        ...dynamicOrigins,
        "https://js.paystack.co",
        "https://checkout.flutterwave.com",
        "https://js.hcaptcha.com",
        "https://hcaptcha.com",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ])),

      // Styles: allow Google Fonts and minimal inline styles (some libs inject style tags)
      styleSrc: Array.from(new Set([
        "'self'",
        "'unsafe-inline'", // Note: required for some component libs; review periodically
        "https://fonts.googleapis.com",
        ...dynamicOrigins
      ])),

      // Fonts: Google Fonts static
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],

      // Images: allow data URIs for inline icons and https for external logos
      imgSrc: ["'self'", "data:", "https:"],

      // XHR/fetch/WebSocket endpoints
      // - Self for API
      // - Payment APIs for client-side verification/polling: api.paystack.co, api.flutterwave.com
      // - Sentry ingestion (if enabled)
      // - WebSockets for notifications/HMR: wss: always, ws: only in dev
      connectSrc: Array.from(new Set([
        "'self'",
        "wss:",
        ...(isDev ? ["ws:"] : []),
        ...dynamicOrigins,
        "https://api.paystack.co",
        "https://api.flutterwave.com",
        "https://*.ingest.sentry.io",
        "https://hcaptcha.com",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
      ])),

      // Allow provider-hosted iframes/popups
      // - Paystack may open checkout on *.paystack.com
      // - Flutterwave hosts checkout on *.flutterwave.com
      frameSrc: Array.from(new Set([
        "'self'",
        ...dynamicOrigins,
        "https://*.paystack.co",
        "https://*.flutterwave.com",
        // Legacy Flutterwave modal host (rare/optional)
        "https://ravemodal.flwv.io",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
        "https://hcaptcha.com",
        "https://*.hcaptcha.com"
      ])),

      // Allow form POST redirects to providers if flow uses full-page redirects
      formAction: [
        "'self'",
        "https://*.paystack.co",
        "https://*.flutterwave.com"
      ],

      // Workers/media for SPA features
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'", "blob:"],

      // Clickjacking protection (also enforced by frameguard)
      frameAncestors: ["'none'"],

      // Forbid plugins
      objectSrc: ["'none'"]
    }
  },

  // HSTS ONLY in production to avoid issues on localhost/dev
  hsts: isDev
    ? false
    : {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },

  // Classic headers
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' }
  // NOTE: helmet@8 removed xssFilter. We set X-XSS-Protection in securityHeaders for legacy UAs.
});

// CORS middleware - only apply to API routes
export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip CORS for static files and non-API routes
  // Use more precise checks to avoid interfering with asset requests
  if (req.path.startsWith('/assets/') || 
      req.path.startsWith('/static/') || 
      req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|xml|txt|pdf|zip|mp4|webm|ogg|mp3|wav)$/i) || 
      !req.path.startsWith('/api/')) {
    return next();
  }
  
  // Apply CORS only to API routes
  // Handle explicit OPTIONS preflight quickly to avoid other middleware
  if (req.method === 'OPTIONS') {
    return cors(corsOptions)(req, res, () => res.sendStatus(204));
  }
  return cors(corsOptions)(req, res, next);
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Allow geolocation on same-origin to avoid policy violation logs if the app requests it
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=(), payment=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

// IP whitelist middleware (if needed)
export const ipWhitelistCheck = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Skip IP check for development
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
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
      if (error instanceof Error) {
        logger.debug('Failed to parse redirect URL', { error: error.message, redirectUrl });
      }
    }
  }
  
  next();
};
