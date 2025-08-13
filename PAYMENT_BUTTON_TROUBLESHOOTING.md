# Paystack Payment Button Troubleshooting Guide

## Issue: Paystack Payment Button Not Working After Signup

If the "Pay with Paystack" button is not working on your deployed ChainSync site, follow this troubleshooting guide to identify and fix the issue.

## 🔍 Quick Diagnosis

### Step 1: Check Browser Console
1. Open your deployed site
2. Fill out the signup form
3. When you reach the payment step, right-click and select "Inspect"
4. Go to the Console tab
5. Click the "Pay with Paystack" button
6. Look for any error messages

**Common Console Errors:**
- `Payment initialization failed` - Server-side payment service issue
- `CSRF token expired` - Security token issue
- `Network error` - API endpoint not reachable
- `500 Internal Server Error` - Server configuration issue

### Step 2: Check Environment Variables
Run the environment check script to verify all required variables are set:

```bash
npm run check:env
```

## 🚨 Most Common Causes & Solutions

### 1. Missing Paystack API Keys (Most Likely Cause)

**Problem:** The `PAYSTACK_SECRET_KEY` environment variable is not set in your deployment.

**Solution:**
1. Go to your [Render Dashboard](https://dashboard.render.com)
2. Select your ChainSync service
3. Go to the "Environment" tab
4. Add the following environment variable:
   ```
   Key: PAYSTACK_SECRET_KEY
   Value: sk_test_your_actual_paystack_secret_key_here
   ```
5. Click "Save Changes"
6. Redeploy your service

**How to Get Paystack API Keys:**
1. Go to [Paystack Dashboard](https://dashboard.paystack.com)
2. Navigate to Settings → API Keys & Webhooks
3. Copy your Secret Key (starts with `sk_test_` for test mode or `sk_live_` for live mode)

### 2. Missing Flutterwave API Keys

**Problem:** International users cannot make payments because `FLUTTERWAVE_SECRET_KEY` is missing.

**Solution:**
1. Add to your Render environment variables:
   ```
   Key: FLUTTERWAVE_SECRET_KEY
   Value: FLWSECK_TEST_your_actual_flutterwave_secret_key_here
   ```

### 3. Incorrect BASE_URL Configuration

**Problem:** Payment callbacks are failing because the base URL is wrong.

**Solution:**
1. Ensure `BASE_URL` is set to your actual domain:
   ```
   Key: BASE_URL
   Value: https://yourdomain.com
   ```
2. Don't include trailing slashes

### 4. Database Connection Issues

**Problem:** Payment service cannot initialize due to database connection failures.

**Solution:**
1. Verify `DATABASE_URL` is correct
2. Check if your database is accessible from Render
3. Ensure database credentials are valid

## 🛠️ Advanced Troubleshooting

### Check Server Logs
1. In your Render dashboard, go to your service
2. Click on "Logs" tab
3. Look for payment-related error messages
4. Common errors include:
   - "Payment service keys are required"
   - "Failed to initialize Paystack payment"
   - "Database connection failed"

### Test Payment Endpoint
Create a simple test script to verify the payment endpoint:

```bash
# Test the payment initialization endpoint
curl -X POST https://yourdomain.com/api/payment/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "currency": "NGN",
    "provider": "paystack",
    "tier": "basic",
    "metadata": {
      "firstName": "Test",
      "lastName": "User"
    }
  }'
```

### Verify Payment Service Initialization
Check if the payment service is properly initialized by looking for this log message:
```
Payment service keys are required. Please set PAYSTACK_SECRET_KEY and FLUTTERWAVE_SECRET_KEY in environment variables.
```

## 🔧 Fix Implementation

### Option 1: Add Missing Environment Variables (Recommended)
1. **PAYSTACK_SECRET_KEY**: Your Paystack secret key
2. **FLUTTERWAVE_SECRET_KEY**: Your Flutterwave secret key  
3. **BASE_URL**: Your domain (e.g., https://chainsync.store)
4. **DATABASE_URL**: Your PostgreSQL connection string

### Option 2: Use Test Keys for Development
If you're still testing, use test API keys:
```
PAYSTACK_SECRET_KEY=sk_test_1234567890abcdef
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST_1234567890abcdef
```

### Option 3: Check Payment Service Configuration
Verify the payment service is properly configured in `server/payment/service.ts`:
```typescript
constructor() {
  this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';
  this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
  
  if (!this.paystackSecretKey || !this.flutterwaveSecretKey) {
    throw new Error('Payment service keys are required...');
  }
}
```

## ✅ Verification Steps

After fixing the environment variables:

1. **Redeploy your service** on Render
2. **Test the signup flow** again
3. **Check the browser console** for any remaining errors
4. **Verify payment initialization** works
5. **Test with both Nigerian and International locations**

## 🆘 Still Not Working?

If the issue persists after following these steps:

1. **Check Render logs** for detailed error messages
2. **Verify all environment variables** are set correctly
3. **Test the payment endpoint** directly with curl
4. **Check database connectivity** from Render
5. **Contact support** with your error logs

## 📋 Environment Variables Checklist

Ensure these are set in your Render deployment:

- [ ] `PAYSTACK_SECRET_KEY` (starts with `sk_test_` or `sk_live_`)
- [ ] `FLUTTERWAVE_SECRET_KEY` (starts with `FLWSECK_TEST_` or `FLWSECK_`)
- [ ] `BASE_URL` (your actual domain)
- [ ] `DATABASE_URL` (PostgreSQL connection string)
- [ ] `JWT_SECRET` (random secure string)
- [ ] `SESSION_SECRET` (random secure string)
- [ ] `NODE_ENV` (set to `production`)

## 🔗 Useful Links

- [Render Environment Variables Documentation](https://render.com/docs/environment-variables)
- [Paystack API Documentation](https://paystack.com/docs/api/)
- [Flutterwave API Documentation](https://developer.flutterwave.com/docs)
- [ChainSync Deployment Guide](./DEPLOYMENT.md)
