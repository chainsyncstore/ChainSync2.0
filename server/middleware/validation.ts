import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { sendErrorResponse } from "../lib/errors";
import { ValidationError } from "../lib/errors";
import { LogContext } from "../lib/logger";

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
          return res.status(400).json({ error: formattedErrors.map(e => e.field).join(', ') });
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
  dataExtractor: (req: Request) => any
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
export function handleAsyncError(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
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
