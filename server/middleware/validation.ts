import { eq } from "drizzle-orm";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodError } from "zod";
import { auditLogs, users } from "@shared/schema";
import { db } from "../db";
import { sendErrorResponse } from "../lib/errors";
import { ValidationError } from "../lib/errors";
import { LogContext, logger } from "../lib/logger";

/**
 * Middleware to validate request body against a Zod schema
 * @param schema - The Zod schema to validate against
 * @returns Express middleware function
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request body against the schema
      const validatedData = schema.parse(req.body);
      
      // Replace the request body with the validated and sanitized data
      req.body = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        if (process.env.NODE_ENV === 'test') {
          const detailedError = formattedErrors.map(e => `${e.field}: ${e.message}`).join(', ');
          return res.status(400).json({ error: detailedError, details: formattedErrors });
        } else {
          const validationError = new ValidationError(
            "Validation failed",
            formattedErrors
          );
          sendErrorResponse(res, validationError, req.path);
        }
      } else {
        // Handle unexpected errors
        const unexpectedError = new ValidationError("Unexpected validation error");
        sendErrorResponse(res, unexpectedError, req.path);
      }
    }
  };
}

/**
 * Middleware to validate request query parameters against a Zod schema
 * @param schema - The Zod schema to validate against
 * @returns Express middleware function
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request query against the schema
      const validatedData = schema.parse(req.query);
      
      // Replace the request query with the validated data
      req.query = validatedData as any;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        const validationError = new ValidationError(
          "Query validation failed",
          formattedErrors
        );
        
        sendErrorResponse(res, validationError, req.path);
      } else {
        // Handle unexpected errors
        const unexpectedError = new ValidationError("Unexpected query validation error");
        sendErrorResponse(res, unexpectedError, req.path);
      }
    }
  };
}

/**
 * Middleware to validate request parameters against a Zod schema
 * @param schema - The Zod schema to validate against
 * @returns Express middleware function
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request params against the schema
      const validatedData = schema.parse(req.params);
      
      // Replace the request params with the validated data
      req.params = validatedData as any;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        const validationError = new ValidationError(
          "Parameter validation failed",
          formattedErrors
        );
        
        sendErrorResponse(res, validationError, req.path);
      } else {
        // Handle unexpected errors
        const unexpectedError = new ValidationError("Unexpected parameter validation error");
        sendErrorResponse(res, unexpectedError, req.path);
      }
    }
  };
}

/**
 * Generic validation middleware that can validate any part of the request
 * @param schema - The Zod schema to validate against
 * @param dataExtractor - Function to extract data from the request
 * @returns Express middleware function
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  // eslint-disable-next-line no-unused-vars
  dataExtractor: (req: Request) => unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract data from the request
      const data = dataExtractor(req);
      
      // Validate the extracted data against the schema
      const validatedData = schema.parse(data);
      
      // Store validated data in request for later use
      (req as any).validatedData = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        const validationError = new ValidationError(
          "Request validation failed",
          formattedErrors
        );
        
        sendErrorResponse(res, validationError, req.path);
      } else {
        // Handle unexpected errors
        const unexpectedError = new ValidationError("Unexpected request validation error");
        sendErrorResponse(res, unexpectedError, req.path);
      }
    }
  };
}

/**
 * Wrapper for async route handlers to catch errors
 * @param fn - Async function to wrap
 * @returns Express middleware function
 */
export function handleAsyncError(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Extract logging context from request
 * @param req - Express request object
 * @returns LogContext object
 */
export function extractLogContext(req: Request, additional?: Partial<LogContext>) {
  return {
    ipAddress: req.ip || (req as any).connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    path: req.path,
    method: req.method,
    userId: (req.session as any)?.user?.id,
    storeId: (req.session as any)?.user?.storeId,
    ...(additional || {})
  } as LogContext;
}

// Audit middleware: write a row for all non-GET requests
export function auditMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next();
    const started = Date.now();
    const userId: string | undefined = (req.session as any)?.userId || (req.session as any)?.user?.id;
    let orgId: string | undefined = (req as any).orgId || (req.session as any)?.orgId;

    if (!orgId && userId) {
      try {
        const [userRow] = await db
          .select({ orgId: users.orgId })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        orgId = userRow?.orgId as string | undefined;
        if (orgId) {
          (req as any).orgId = orgId;
          if (req.session) {
            (req.session as any).orgId = orgId;
          }
        }
      } catch (error) {
        logger.warn("Failed to resolve orgId for audit log", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const ip = req.ip || (req as any).connection?.remoteAddress;
    const userAgent = req.get('User-Agent');

    // Defer insert until response finished to attach status
    _res.on('finish', async () => {
      try {
        if (!orgId) {
          logger.warn("Skipping audit log due to missing orgId", {
            userId,
            path: req.path,
          });
          return;
        }
        const entity = req.path.split('/').filter(Boolean)[1] || 'unknown';
        const action = `${req.method}`;
        await db.insert(auditLogs).values({
          orgId: orgId as any,
          userId: userId as any,
          action,
          entity,
          entityId: undefined as any,
          meta: {
            path: req.path,
            status: _res.statusCode,
            durationMs: Date.now() - started,
            bodyKeys: Object.keys(req.body || {}),
            query: req.query || {},
          } as any,
          ip: ip as any,
          userAgent: userAgent as any,
        } as any);
      } catch (error) {
        logger.warn("Failed to write audit log", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    next();
  };
}
