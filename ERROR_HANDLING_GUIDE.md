# Error Handling & Reliability Guide - Phase 2

This document outlines the comprehensive error handling and reliability improvements implemented in ChainSync Phase 2.

## Overview

Phase 2 introduces standardized error handling across all endpoints, React error boundaries for UI-level failures, and retry logic for payment processing to ensure consistent and reliable application behavior.

## 1. Standardized API Error Response Format

### Server-Side Error Handling

All API endpoints now return a standardized JSON error format:

```typescript
interface ApiErrorResponse {
  status: 'error';
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
  path?: string;
}
```

### Error Classes

Custom error classes for different scenarios:

- `AppError` - Base error class with status code and operational flag
- `ValidationError` - For input validation failures (422)
- `AuthenticationError` - For authentication issues (401)
- `AuthorizationError` - For permission issues (403)
- `NotFoundError` - For missing resources (404)
- `ConflictError` - For resource conflicts (409)
- `RateLimitError` - For rate limiting (429)
- `PaymentError` - For payment processing issues (400)

### Usage Example

```typescript
// In API routes
app.post("/api/auth/login", handleAsyncError(async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    throw new ValidationError("Username and password are required");
  }
  
  const user = await storage.authenticateUser(username, password);
  
  if (user) {
    sendSuccessResponse(res, user, "Login successful");
  } else {
    throw new AuthenticationError("Invalid credentials");
  }
}));
```

## 2. React Error Boundaries

### Error Boundary Component

The `ErrorBoundary` component catches JavaScript errors anywhere in the component tree and displays a fallback UI.

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

### Features

- **Graceful Error Display**: Shows user-friendly error messages
- **Development Details**: Displays error details in development mode
- **Retry Functionality**: Allows users to retry failed operations
- **Navigation**: Provides option to go back to home page
- **Error Logging**: Logs errors for debugging and monitoring

### Higher-Order Component

Wrap components with error boundaries:

```typescript
import { withErrorBoundary } from '@/components/error-boundary';

const SafeComponent = withErrorBoundary(YourComponent);
```

### Error Handler Hook

For functional components:

```typescript
import { useErrorHandler } from '@/components/error-boundary';

function MyComponent() {
  const handleError = useErrorHandler();
  
  const handleRiskyOperation = () => {
    try {
      // Risky operation
    } catch (error) {
      handleError(error);
    }
  };
}
```

## 3. Centralized API Client

### Features

- **Standardized Error Handling**: All API calls use consistent error handling
- **Automatic Toast Notifications**: Shows user-friendly error messages
- **Authentication Redirects**: Automatically redirects to login on auth errors
- **Network Error Handling**: Handles connection issues gracefully
- **Request/Response Interceptors**: Centralized request processing

### Usage

```typescript
import { apiClient, handleApiError } from '@/lib/api-client';

// GET request
const products = await apiClient.get('/products');

// POST request
const newProduct = await apiClient.post('/products', productData);

// Error handling
try {
  const data = await apiClient.get('/products');
} catch (error) {
  handleApiError(error);
}
```

### Error Code Handling

The API client automatically handles different error codes:

- `UNAUTHORIZED` - Redirects to login
- `FORBIDDEN` - Shows permission error
- `NOT_FOUND` - Shows resource not found message
- `VALIDATION_ERROR` - Shows input validation message
- `RATE_LIMIT_EXCEEDED` - Shows rate limit message
- `PAYMENT_ERROR` - Shows payment-specific error
- `NETWORK_ERROR` - Shows connection error

## 4. Payment Processing Retry Logic

### Enhanced Payment Verification

Both Paystack and Flutterwave payment verification now include:

- **Retry Logic**: Up to 3 attempts with exponential backoff
- **Timeout Handling**: 10-second timeout per request
- **Smart Retry**: Doesn't retry on client errors (4xx) except rate limits
- **Detailed Logging**: Comprehensive logging for debugging
- **Error Classification**: Proper error categorization

### Implementation

```typescript
async verifyPaystackPayment(reference: string, maxRetries: number = 3): Promise<boolean> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'Authorization': `Bearer ${this.paystackSecretKey}` }
      });
      
      if (response.data.data.status === 'success') {
        return true;
      }
      return false;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors except rate limits
      if (isClientError(error) && !isRateLimit(error)) {
        break;
      }
      
      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new PaymentError(`Payment verification failed after ${maxRetries} attempts`);
}
```

## 5. Server-Side Error Middleware

### Enhanced Error Handling

The main error middleware now provides:

- **Structured Logging**: Detailed error logs with context
- **Operational Error Handling**: Distinguishes between operational and programming errors
- **Development vs Production**: Different behavior in different environments
- **Error Classification**: Proper error categorization

```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Log the error for debugging
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode || err.status,
    code: err.code,
    path: _req.path,
    method: _req.method,
    timestamp: new Date().toISOString()
  });

  // Send standardized error response
  sendErrorResponse(res, err, _req.path);

  // Only re-throw non-operational errors in development
  if (app.get("env") === "development" && !isOperationalError(err)) {
    throw err;
  }
});
```

## 6. Best Practices

### For Developers

1. **Use Error Classes**: Always use appropriate error classes instead of generic errors
2. **Handle Async Errors**: Use `handleAsyncError` wrapper for async route handlers
3. **Provide Context**: Include relevant details in error messages
4. **Log Appropriately**: Log errors with sufficient context for debugging
5. **User-Friendly Messages**: Show user-friendly messages while logging technical details

### For API Consumers

1. **Use API Client**: Always use the centralized API client for frontend requests
2. **Handle Errors**: Implement proper error handling in components
3. **Show Feedback**: Use toast notifications for user feedback
4. **Retry Logic**: Implement retry logic for critical operations
5. **Error Boundaries**: Wrap components with error boundaries

### Error Response Examples

#### Success Response
```json
{
  "status": "success",
  "data": { "id": 1, "name": "Product" },
  "message": "Product created successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Error Response
```json
{
  "status": "error",
  "message": "Product name is required",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "name",
      "message": "Name is required"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/products"
}
```

## 7. Monitoring and Debugging

### Error Tracking

- **Console Logging**: All errors are logged to console with context
- **Production Logging**: Structured logging for production environments
- **Error Classification**: Errors are categorized for better monitoring
- **Performance Impact**: Minimal performance impact from error handling

### Debugging Tips

1. **Check Error Codes**: Use error codes to identify specific issues
2. **Review Logs**: Check server logs for detailed error information
3. **Network Tab**: Use browser dev tools to inspect API responses
4. **Error Boundaries**: Check error boundary fallback UI for component errors
5. **Payment Logs**: Review payment verification logs for transaction issues

## 8. Migration Guide

### Updating Existing Code

1. **Replace Manual Error Handling**: Use `handleAsyncError` wrapper
2. **Update Response Format**: Use `sendSuccessResponse` and `sendErrorResponse`
3. **Replace Fetch Calls**: Use the centralized API client
4. **Add Error Boundaries**: Wrap critical components
5. **Update Error Messages**: Use standardized error classes

### Example Migration

#### Before
```typescript
app.post("/api/products", async (req, res) => {
  try {
    const product = await storage.createProduct(req.body);
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Failed to create product" });
  }
});
```

#### After
```typescript
app.post("/api/products", handleAsyncError(async (req, res) => {
  const productData = insertProductSchema.parse(req.body);
  const product = await storage.createProduct(productData);
  sendSuccessResponse(res, product, "Product created successfully");
}));
```

This comprehensive error handling system ensures that ChainSync provides a reliable and user-friendly experience even when things go wrong. 