import { Response } from 'express';

export interface ApiErrorResponse {
  status: 'error';
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
  path?: string;
}

export interface ApiSuccessResponse<T = any> {
  status: 'success';
  data: T;
  message?: string;
  timestamp: string;
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code?: string, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || this.getDefaultCode(statusCode);
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  private getDefaultCode(statusCode: number): string {
    switch (statusCode) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'VALIDATION_ERROR';
      case 429: return 'RATE_LIMIT_EXCEEDED';
      case 500: return 'INTERNAL_SERVER_ERROR';
      case 502: return 'BAD_GATEWAY';
      case 503: return 'SERVICE_UNAVAILABLE';
      default: return 'UNKNOWN_ERROR';
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class PaymentError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'PAYMENT_ERROR');
    this.details = details;
  }
}

export function sendErrorResponse(res: Response, error: AppError | Error, path?: string): void {
  let apiError: ApiErrorResponse;

  if (error instanceof AppError) {
    apiError = {
      status: 'error',
      message: error.message,
      code: error.code,
      details: (error as any).details,
      timestamp: new Date().toISOString(),
      path
    };
  } else {
    apiError = {
      status: 'error',
      message: error.message || 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
      path
    };
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  res.status(statusCode).json(apiError);
}

export function sendSuccessResponse<T>(res: Response, data: T, message?: string): void {
  const response: ApiSuccessResponse<T> = {
    status: 'success',
    data,
    message,
    timestamp: new Date().toISOString()
  };
  res.json(response);
}

export function handleAsyncError(fn: Function) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
} 