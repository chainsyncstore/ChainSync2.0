import type { Express } from "express";
import { createServer, type Server } from "http";

// Deprecated: All routes are now registered exclusively in `server/api/index.ts`.
// This file remains as a no-op to avoid accidental duplicate route registration.
export async function registerEnhancedRoutes(app: Express): Promise<Server> {
  return createServer(app);
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { EnhancedAuthService } from "./auth-enhanced";
import { 
  insertProductSchema, 
  insertTransactionSchema, 
  insertTransactionItemSchema,
  insertLoyaltyTierSchema,
  insertCustomerSchema,
  insertLoyaltyTransactionSchema,
  insertUserSchema,
  type User
} from "@shared/schema";
import { z } from "zod";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, desc } from "drizzle-orm";
import { forecastModels } from "@shared/schema";
import { db } from "./db";
import { OpenAIService } from "./openai/service";
import { PaymentService } from "./payment/service";
import { 
  sendErrorResponse, 
  sendSuccessResponse, 
  handleAsyncError,
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  PaymentError
} from "./lib/errors";
import { 
  performanceMiddleware, 
  getPerformanceMetrics, 
  clearPerformanceMetrics 
} from "./lib/performance";
import { logger, extractLogContext } from "./lib/logger";
import { monitoringService } from "./lib/monitoring";
import { validateBody } from "./middleware/validation";
import { SignupSchema, LoginSchema } from "./schemas/auth";
import { authRateLimit } from "./middleware/security";

// Extend the session interface
declare module "express-session" {
  interface SessionData {
    user: User;
  }
}

// Enhanced auth schemas
const EmailVerificationSchema = z.object({
  token: z.string().min(1, "Verification token is required")
});

const PhoneVerificationSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  otp: z.string().length(6, "OTP must be 6 digits")
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required")
});

const ResendVerificationSchema = z.object({
  email: z.string().email("Valid email is required")
});

export async function registerEnhancedRoutes(app: Express): Promise<Server> {
  // Validate required environment variables
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required for production');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for production');
  }

  // Add performance monitoring middleware
  app.use(performanceMiddleware);

  // Session configuration with enhanced security
  const pgSession = connectPg(session);
  app.use(session({
    store: new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Secure in production
      httpOnly: true,
      maxAge: 60 * 60 * 1000, // 1 hour (reduced from 24 hours)
      sameSite: 'strict',
    },
    name: 'chainsync.sid', // Custom session name
  }));

  // Enhanced authentication middleware
  const authenticateUser = (req: any, res: any, next: any) => {
    if (req.session.user) {
      // Check if user is still verified
      if (!req.session.user.emailVerified) {
        return sendErrorResponse(res, new AuthenticationError("Email verification required"), req.path);
      }
      next();
    } else {
      sendErrorResponse(res, new AuthenticationError("Not authenticated"), req.path);
    }
  };

  // Enhanced authentication routes
  app.post("/api/auth/login", 
    authRateLimit,
    validateBody(LoginSchema),
    handleAsyncError(async (req, res) => {
      const { username, password } = req.body;
      
      const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      const userAgent = req.get('User-Agent');
      const logContext = extractLogContext(req, { ipAddress, userAgent });
      
      try {
        // Use enhanced authentication service
        const authResult = await EnhancedAuthService.authenticateUser(username, password, ipAddress);
        
        if (authResult.success && authResult.user) {
          // Create JWT session
          const session = await EnhancedAuthService.createUserSession(
            authResult.user.id, 
            ipAddress, 
            userAgent
          );
          
          // Sanitize user data before storing in session
          const sanitizedUser = EnhancedAuthService.sanitizeUserForSession(authResult.user);
          req.session.user = sanitizedUser;
          
          // Log successful login
          logger.logAuthEvent('login', { ...logContext, userId: authResult.user.id, storeId: authResult.user.storeId });
          monitoringService.recordAuthEvent('login', { ...logContext, userId: authResult.user.id, storeId: authResult.user.storeId });
          
          sendSuccessResponse(res, {
            user: sanitizedUser,
            accessToken: session.sessionToken,
            refreshToken: session.refreshToken,
            expiresAt: session.expiresAt
          }, "Login successful");
        } else {
          // Log failed login attempt
          logger.logAuthEvent('login_failed', logContext);
          monitoringService.recordAuthEvent('login_failed', logContext);
          
          if (authResult.lockoutUntil) {
            sendErrorResponse(res, new AuthenticationError(authResult.error), req.path);
          } else {
            sendErrorResponse(res, new AuthenticationError(authResult.error), req.path);
          }
        }
      } catch (error) {
        // Log failed login attempt
        logger.logAuthEvent('login_failed', logContext);
        monitoringService.recordAuthEvent('login_failed', logContext);
        throw error;
      }
    }));

  // Continue with other routes...
  // This is a basic structure - more routes would be added here

  return createServer(app);
}
