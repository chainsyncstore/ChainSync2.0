# Flutterwave Integration Fixes

## Overview
This document outlines the fixes and improvements made to the Flutterwave payment integration to ensure it works correctly alongside the existing Paystack integration.

## Issues Identified and Fixed

### 1. Parameter Mismatch in Verification
**Problem**: The `verifyFlutterwavePayment` method was expecting a `transactionId` parameter but the routes were passing a `reference`.

**Fix**: Updated the method signature to accept `reference` instead of `transactionId` and corrected the verification endpoint URL.

**Before**:
```typescript
async verifyFlutterwavePayment(transactionId: string, maxRetries: number = 3)
// Using: ${this.flutterwaveBaseUrl}/transactions/${transactionId}/verify
```

**After**:
```typescript
async verifyFlutterwavePayment(reference: string, maxRetries: number = 3)
// Using: ${this.flutterwaveBaseUrl}/transactions/verify_by_reference?tx_ref=${reference}
```

### 2. Missing Flutterwave Webhook Endpoint
**Problem**: There was no dedicated webhook endpoint for Flutterwave payment confirmations, unlike Paystack which had one.

**Fix**: Added a new Flutterwave-specific webhook endpoint at `/api/payment/flutterwave-webhook`.

**New Endpoint**:
```typescript
app.post("/api/payment/flutterwave-webhook", async (req, res) => {
  // Handles Flutterwave 'charge.completed' events
  // Processes tx_ref, amount, status, and customer data
  // Logs successful payments and responds with 200 status
});
```

### 3. Callback URL Configuration
**Problem**: Flutterwave initialization wasn't properly handling the callback URL fallback when `BASE_URL` environment variable wasn't set.

**Fix**: Updated the `initializeFlutterwavePayment` method to use the same callback URL fallback pattern as Paystack.

**Before**:
```typescript
redirect_url: request.callback_url || `${process.env.BASE_URL}/payment/callback`
```

**After**:
```typescript
redirect_url: request.callback_url || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/callback`
```

### 4. Enhanced Logging and Error Handling
**Problem**: Flutterwave methods lacked comprehensive logging and error handling compared to Paystack.

**Fix**: Added extensive logging and improved error handling throughout the Flutterwave integration.

**Improvements**:
- Added logging for payment initialization with callback URL
- Added logging for successful payment initialization
- Enhanced error logging with Axios response details
- Added logging for verification attempts and results
- Improved error messages with reference information

## Files Modified

### 1. `server/payment/service.ts`
- Fixed `verifyFlutterwavePayment` method signature and endpoint
- Enhanced `initializeFlutterwavePayment` with better logging and callback URL handling
- Improved error handling and logging throughout

### 2. `server/routes.ts`
- Added dedicated Flutterwave webhook endpoint
- Ensured consistent callback URL handling for both payment providers

### 3. `test-payment-callback.js`
- Updated test script to test both Paystack and Flutterwave scenarios
- Added tests for Flutterwave callback parameters (`trx_ref`)
- Added tests for Flutterwave webhook endpoint
- Added tests for Flutterwave payment verification API

## Flutterwave-Specific Parameters

### Callback URL Parameters
- **Primary**: `trx_ref` - The transaction reference (equivalent to Paystack's `reference`)
- **Status**: `status` - Payment status (usually "successful" for successful payments)

### Webhook Events
- **Event**: `charge.completed` - Triggered when payment is successfully completed
- **Data**: Contains `tx_ref`, `amount`, `status`, and `customer` information

### Verification Endpoint
- **URL**: `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref={reference}`
- **Method**: GET
- **Authentication**: Bearer token with `FLUTTERWAVE_SECRET_KEY`

## Testing

### Manual Testing
1. **Client Callback**: Test with Flutterwave callback URL parameters
2. **Server Verification**: Test payment verification API with Flutterwave references
3. **Webhook Processing**: Test webhook endpoint with mock Flutterwave data

### Automated Testing
Run the updated test script:
```bash
node test-payment-callback.js
```

This will test:
- Paystack callback handling
- Flutterwave callback handling
- Payment verification for both providers
- Webhook endpoints for both providers

## Environment Variables Required

Ensure these Flutterwave environment variables are set:
```bash
FLUTTERWAVE_SECRET_KEY="your-secret-key"
FLUTTERWAVE_ENCRYPTION_KEY="your-encryption-key"
FLUTTERWAVE_PUBLIC_KEY="your-public-key"
BASE_URL="http://localhost:3000"  # For development
```

## Production Considerations

### Webhook Security
- Implement signature verification using Flutterwave's secret hash
- Validate webhook payload integrity
- Use HTTPS for all webhook endpoints

### Error Handling
- Implement proper retry logic for failed verifications
- Log all payment events for audit trails
- Handle edge cases (duplicate webhooks, partial payments, etc.)

### Monitoring
- Monitor webhook delivery success rates
- Track payment verification success/failure rates
- Set up alerts for payment processing issues

## Summary

The Flutterwave integration has been fully aligned with the Paystack integration in terms of:
- ✅ Consistent callback URL handling
- ✅ Proper parameter mapping (`trx_ref` for Flutterwave, `reference`/`trxref` for Paystack)
- ✅ Dedicated webhook endpoints for both providers
- ✅ Comprehensive logging and error handling
- ✅ Robust verification with retry logic
- ✅ Proper testing coverage

Both payment gateways now work consistently and reliably within the ChainSync application.
