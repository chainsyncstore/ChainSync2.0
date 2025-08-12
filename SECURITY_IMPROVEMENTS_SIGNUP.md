# Signup Security Improvements

This document outlines the security enhancements implemented in the ChainSync signup system.

## 1. Hard-coded Pricing Elimination

### Before
- Pricing was stored as formatted strings (e.g., "₦30,000", "$30")
- Amounts were parsed by stripping symbols and commas: `.replace('₦', '').replace(',', '')`
- This approach was error-prone and could lead to incorrect amounts being sent to payment gateways

### After
- Pricing is now stored as numeric values in cents in `client/src/lib/constants.ts`
- Basic: ₦30,000 = 3,000,000 kobo (cents)
- Pro: ₦100,000 = 10,000,000 kobo (cents)  
- Enterprise: ₦500,000 = 50,000,000 kobo (cents)
- USD amounts are also stored in cents for consistency

### Benefits
- Eliminates parsing errors
- Ensures exact amounts are sent to payment gateways
- Centralized pricing management
- Type-safe pricing data

## 2. Payment URL Security Validation

### Before
- Direct redirect to payment URLs without validation
- Potential for malicious redirects if payment gateway is compromised

### After
- Added `validatePaymentUrl()` function in `client/src/lib/security.ts`
- Validates that payment URLs are from expected provider domains
- Supported domains:
  - Paystack: `paystack.com`, `paystack.co`
  - Flutterwave: `flutterwave.com`, `flutterwave.co`, `ravepay.co`
- Blocks redirects to unexpected domains

### Implementation
```typescript
// Security: Validate that the payment URL is from an expected provider domain
if (!validatePaymentUrl(paymentUrl, paymentProvider)) {
  throw new Error('Invalid payment provider URL detected');
}
```

## 3. reCAPTCHA v3 Integration

### Before
- No bot protection on signup form
- Vulnerable to automated signup attacks

### After
- Integrated reCAPTCHA v3 for invisible bot protection
- Token generation before form submission
- Token included in signup API request
- Fallback token generation for development

### Configuration
- Set `VITE_RECAPTCHA_SITE_KEY` in environment variables
- reCAPTCHA v3 runs invisibly without user interaction
- Action-based scoring system for bot detection

### Implementation
```typescript
// Generate reCAPTCHA token for bot protection
const recaptchaToken = await generateRecaptchaToken();

const signupData = {
  // ... other fields
  recaptchaToken // Include reCAPTCHA token in signup data
};
```

## 4. Alternative: hCaptcha Support

- Added hCaptcha as an alternative to reCAPTCHA
- Set `VITE_HCAPTCHA_SITE_KEY` in environment variables
- Same security benefits with different provider

## 5. Type Safety Improvements

### Added Global Type Declarations
- `client/src/types/global.d.ts` for reCAPTCHA and hCaptcha types
- Proper TypeScript support for external libraries
- Eliminates type errors in security functions

## 6. Constants Centralization

### New Files Created
- `client/src/lib/constants.ts` - Centralized pricing and validation constants
- `client/src/lib/security.ts` - Security utility functions

### Benefits
- Single source of truth for pricing
- Easier maintenance and updates
- Consistent validation across components
- Reusable security functions

## 7. Environment Configuration

### Updated `env.example`
- Added reCAPTCHA and hCaptcha configuration
- Documented all required environment variables
- Clear configuration examples

## Security Best Practices Implemented

1. **Input Validation**: All pricing data is validated against constants
2. **URL Validation**: Payment URLs are validated before redirect
3. **Bot Protection**: reCAPTCHA v3 integration for automated attack prevention
4. **Type Safety**: Full TypeScript support for security functions
5. **Centralized Configuration**: Single source of truth for security settings
6. **Error Handling**: Proper error handling and logging for security events

## Next Steps for Production

1. **reCAPTCHA Verification**: Implement server-side token verification
2. **Rate Limiting**: Add rate limiting to signup endpoints
3. **IP Blocking**: Implement IP-based blocking for suspicious activity
4. **Monitoring**: Add security event monitoring and alerting
5. **Testing**: Comprehensive security testing of all improvements

## Testing the Improvements

1. **Pricing Validation**: Verify correct amounts are sent to payment gateways
2. **URL Validation**: Test with valid and invalid payment URLs
3. **reCAPTCHA**: Verify token generation and form submission
4. **Error Handling**: Test security validation failures
5. **Integration**: Verify all components work together correctly

## Files Modified

- `client/src/lib/constants.ts` (new)
- `client/src/lib/security.ts` (new)
- `client/src/types/global.d.ts` (new)
- `client/src/components/auth/signup.tsx`
- `client/src/pages/landing.tsx`
- `env.example`

## Dependencies

No new external dependencies were added. The implementation uses:
- Built-in URL validation
- Environment variables for configuration
- TypeScript for type safety
- Existing API client for requests
