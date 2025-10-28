# Payment Integration Guide

ChainSync supports two payment providers for subscription payments:

## Payment Providers

### 1. Paystack (Nigeria)
- Used for Nigerian users
- Supports NGN currency
- Pricing: Basic (₦30,000), Pro (₦100,000), Enterprise (₦500,000)

### 2. Flutterwave (International)
- Used for users outside Nigeria
- Supports USD currency
- Pricing: Basic ($30), Pro ($100), Enterprise ($500)

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Payment Providers
PAYSTACK_SECRET_KEY="sk_live_98f75f62f6820bc965c76a580775c5cca80d7e34"
PAYSTACK_PUBLIC_KEY="pk_live_724a3f810e189dba909ca21bec4f3a2d0b04b2d8"
FLUTTERWAVE_SECRET_KEY="FLWSECK-aae73f4445dabe479bee62c0a76f0cee-1989803c0e3vt-X"
FLUTTERWAVE_ENCRYPTION_KEY="aae73f4445dafd4c7a11aa60"
FLUTTERWAVE_PUBLIC_KEY="FLWPUBK-c78096411d3d0415787155b94593e7ae-X"

# Application
BASE_URL="http://localhost:3000"
NODE_ENV="development"
```

## Getting API Keys

### Paystack
1. Sign up at [paystack.com](https://paystack.com)
2. Go to Settings > API Keys
3. Copy your Secret Key
4. Use test keys for development

### Flutterwave
1. Sign up at [flutterwave.com](https://flutterwave.com)
2. Go to Settings > API Keys
3. Copy your Secret Key
4. Use test keys for development

## Subscription Tiers

### Basic Plan
- **Nigeria**: ₦30,000/month
- **International**: $30/month
- **Features**: 1 store only, Basic POS, Inventory tracking, Sales reports, Customer management, Email support

### Pro Plan
- **Nigeria**: ₦100,000/month
- **International**: $100/month
- **Features**: Up to 10 stores, Advanced POS features, Real-time analytics, AI-powered insights, Multi-location support, Priority support, Custom branding, Advanced reporting

### Enterprise Plan
- **Nigeria**: ₦500,000/month
- **International**: $500/month
- **Features**: Unlimited stores, Custom integrations, Dedicated account manager, White-label solutions, API access, 24/7 phone support, Custom training, Advanced security

## Free Trial

All plans include a 2-week free trial with no credit card required to start.

## Payment Flow

1. User selects a subscription tier on the landing page
2. User fills out signup form with personal and company information
3. User is redirected to payment gateway (Paystack or Flutterwave)
4. After successful payment, user is redirected to payment callback page
5. Payment is verified and user account is activated
6. User is redirected to dashboard

## Development Mode

In development mode (`NODE_ENV=development`), the system uses mock payment responses instead of actual payment gateway calls. This allows for testing without real API keys.

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use real API keys from payment providers
3. Configure webhook endpoints for payment confirmations
4. Set up proper SSL certificates for secure payment processing

## Webhook Configuration

Configure webhook endpoints in your payment provider dashboard:

- **Paystack**: `https://yourdomain.com/webhooks/paystack` or `https://yourdomain.com/api/payment/paystack-webhook`
- **Flutterwave**: `https://yourdomain.com/webhooks/flutterwave` or `https://yourdomain.com/api/payment/flutterwave-webhook`

Required headers:
- Common: `x-event-id`, `x-event-timestamp` (skew-checked; default ±5m)
- Paystack: `x-paystack-signature` (HMAC-SHA512 with `WEBHOOK_SECRET_PAYSTACK` or `PAYSTACK_SECRET_KEY`)
- Flutterwave: `verif-hash` (HMAC-SHA256 with `WEBHOOK_SECRET_FLW` or `FLUTTERWAVE_SECRET_KEY`)

## Security Considerations

1. Always verify webhook signatures in production
2. Use HTTPS for all payment-related endpoints
3. Store API keys securely
4. Implement proper error handling
5. Log all payment activities for audit purposes

## Support

For payment-related issues:
- Check payment provider documentation
- Verify API keys are correct
- Ensure webhook endpoints are accessible
- Check server logs for error messages 