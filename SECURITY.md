## Logging

Structured JSON logging is standardized on Pino. Each log entry includes request-scoped fields when available: `requestId`, `userId`, `orgId`, `storeId`, plus HTTP request details. Errors are captured to Sentry automatically when `SENTRY_DSN` is set.

## Content Security Policy (CSP)

Server sets CSP via Helmet with allowlists aligned to frontend assets and external services used:

- Styles/Fonts: Google Fonts
- Scripts/Frames: Google reCAPTCHA
- Connect: OpenAI API (AI analytics), payment APIs (Paystack, Flutterwave), optional Sentry ingest
- Images/Data/Workers/Media: self, data:, blob:

If you add new CDNs or third-party endpoints in the client, update `server/middleware/security.ts` CSP directives accordingly.

## Rate limiting

Per-endpoint limits are applied for authentication attempts, payment actions, imports/exports, and other sensitive APIs. Limits are configurable via environment variables:

- RATE_LIMIT_GLOBAL_WINDOW_MS, RATE_LIMIT_GLOBAL_MAX
- RATE_LIMIT_AUTH_WINDOW_MS, RATE_LIMIT_AUTH_MAX
- RATE_LIMIT_SENSITIVE_WINDOW_MS, RATE_LIMIT_SENSITIVE_MAX
- RATE_LIMIT_PAYMENT_WINDOW_MS, RATE_LIMIT_PAYMENT_MAX

## CSRF Strategy

All API routes under `/api` are protected by double-submit CSRF tokens using `csrf-csrf`:

- Cookie: `csrf-token` (httpOnly, SameSite=Lax, Secure in production)
- Header: `X-CSRF-Token`
- Token issuance endpoint: `GET /api/auth/csrf-token` returns `{ token }`, mirrors it in `X-CSRF-Token`, and sets the cookie
- Middleware: applied globally via `csrfProtection` to `/api/**`

Exceptions (explicit):

- `GET /api/auth/csrf-token` is bypassed in CSRF middleware to allow fetching the token
- Test environment (`NODE_ENV=test`): CSRF validation is bypassed to keep integration/E2E tests stable

Notes:

- Client automatically fetches a CSRF token and attaches `X-CSRF-Token` for non-GET requests with `credentials: 'include'`
- Session cookie `chainsync.sid` uses SameSite=Lax, httpOnly, and Secure in production

### Auth route protections summary

- Signup: `authRateLimit` + required bot-prevention (if configured)
- Login: `authRateLimit` + optional bot-prevention
- Request password reset: `authRateLimit` + optional bot-prevention
- Reset password: `authRateLimit` + optional bot-prevention
- Verify email: `sensitiveEndpointRateLimit` + optional bot-prevention
- Setup/Verify 2FA: `sensitiveEndpointRateLimit`
- Change password: `sensitiveEndpointRateLimit`
- Delete account: `sensitiveEndpointRateLimit`
- Logout: session destroy only

This rationale is aligned with current browser behavior and OWASP guidance when using strict session cookie scope and first-party SPAs.

# ChainSync Security Documentation

## 🔐 Security Overview

This document outlines the security measures implemented in ChainSync to protect against vulnerabilities and ensure production-grade security.

## 🛡️ Authentication & Authorization

### Password Security
- **bcrypt Hashing**: All passwords are hashed using bcrypt with 12 salt rounds
- **Password Validation**: Enforces strong password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
- **Secure Password Generation**: Random password generation for initial accounts

### Session Management
- **Store**:
  - Development: in-memory (default `express-session` store)
  - Production: Redis (via `connect-redis`)
- **Cookie Policy**:
  - `httpOnly: true`
  - `secure: true` in production
  - `sameSite: 'lax'` (payments-friendly)
  - `name: 'chainsync.sid'`
  - `maxAge: 8 hours` (8h session timeout)
- **Trust Proxy**: In production, the server trusts the first proxy so the `Secure` flag works behind load balancers.
- **Session Sanitization**: Sensitive fields are stripped before storing user data in session.

### Production Environment Requirements
- `REDIS_URL` must be set (Redis-backed sessions)
- `SESSION_SECRET` must be at least 32 characters
- `CORS_ORIGINS` must contain at least one valid http(s) origin

### Payment Webhooks
- Endpoints (raw body required):
  - Paystack: `POST /webhooks/paystack`, `POST /api/payment/paystack-webhook`
  - Flutterwave: `POST /webhooks/flutterwave`, `POST /api/payment/flutterwave-webhook`
- Aliases: `/api/webhook/paystack`, `/api/webhook/flutterwave`, and a generic `/api/payment/webhook` used in tests
- Required headers:
  - Common: `x-event-id`, `x-event-timestamp` (skew-checked; default ±5m)
  - Paystack: `x-paystack-signature` (HMAC-SHA512 with `WEBHOOK_SECRET_PAYSTACK` or `PAYSTACK_SECRET_KEY`)
  - Flutterwave: `verif-hash` (HMAC-SHA256 with `WEBHOOK_SECRET_FLW` or `FLUTTERWAVE_SECRET_KEY`)

### Role-Based Access Control
- **Hierarchical Roles**: Admin > Manager > Cashier
- **Permission Validation**: Server-side role validation for all endpoints
- **Store-Level Access**: Managers and cashiers restricted to assigned stores

## 🌐 Network Security

### IP Whitelisting
- **IP-Based Access Control**: Restricts login to whitelisted IP addresses
- **Access Logging**: Comprehensive logging of all access attempts
- **Audit Trail**: Detailed logs for security monitoring

### Environment Variables
- **Required Variables**: DATABASE_URL and SESSION_SECRET are mandatory
- **Graceful Failure**: Application fails with clear error messages if required variables are missing
- **No Hardcoded Secrets**: All sensitive data stored in environment variables

## 🔒 Data Protection

### Database Security
- **Parameterized Queries**: Uses Drizzle ORM to prevent SQL injection
- **Input Validation**: Zod schemas validate all input data
- **Data Sanitization**: User data sanitized before session storage

### API Security
- **Authentication Middleware**: All protected routes require valid session
- **Input Validation**: Comprehensive validation for all API endpoints
- **Error Handling**: Secure error messages that don't leak sensitive information

## 🚀 Production Deployment

### Environment Setup
1. **Copy Environment Template**:
   ```bash
   cp env.example .env
   ```

2. **Set Required Variables**:
   ```env
   DATABASE_URL="your-postgresql-connection-string"
   SESSION_SECRET="your-super-secure-random-session-secret-key"
   NODE_ENV="production"
   ```

3. **Generate Secure Session Secret**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### Database Setup
1. **Push Schema**:
   ```bash
   npm run db:push
   ```

2. **Seed Secure Users**:
   ```bash
   npm run seed:secure
   ```

3. **Save Generated Credentials**: The script will output secure passwords - save them securely!

### Security Checklist
- [ ] DATABASE_URL is set and accessible
- [ ] SESSION_SECRET is a strong random string
- [ ] NODE_ENV is set to "production"
- [ ] HTTPS is enabled in production
- [ ] Firewall rules are configured
- [ ] Database backups are scheduled
- [ ] Access logs are monitored
- [ ] IP whitelist is configured

## 🔍 Security Monitoring

### Logging
- **Access Logs**: All login attempts logged with IP addresses
- **Error Logs**: Security-related errors logged for monitoring
- **Audit Trail**: Complete audit trail for user actions

### Monitoring Recommendations
- Monitor failed login attempts
- Review IP access logs regularly
- Check for unusual access patterns
- Monitor database connection health

## 🛠️ Security Tools

### Password Management
- **Secure Password Generation**: `AuthService.generateSecurePassword()`
- **Password Validation**: `AuthService.validatePassword()`
- **Password Hashing**: `AuthService.hashPassword()`

### Authentication Utilities
- **Role Validation**: `AuthService.validateRoleAccess()`
- **User Sanitization**: `AuthService.sanitizeUserForSession()`
- **Secure Comparison**: `AuthService.comparePassword()`

## 🚨 Incident Response

### Security Breach Response
1. **Immediate Actions**:
   - Disable affected accounts
   - Review access logs
   - Check for unauthorized access
   - Update passwords if necessary

2. **Investigation**:
   - Analyze IP access logs
   - Review user activity
   - Check for data breaches
   - Document incident details

3. **Recovery**:
   - Reset compromised passwords
   - Update security measures
   - Notify affected users
   - Implement additional monitoring

## 📋 Security Best Practices

### For Administrators
- Use strong, unique passwords
- Enable IP whitelisting
- Regularly review access logs
- Keep software updated
- Monitor for suspicious activity

### For Developers
- Never commit secrets to version control
- Use environment variables for configuration
- Validate all user input
- Implement proper error handling
- Follow secure coding practices

### For Users
- Use strong passwords
- Log out when finished
- Report suspicious activity
- Keep credentials secure
- Don't share access with others

## 🔧 Security Configuration

### Development vs Production
- **Development**: Relaxed security for testing
- **Production**: Strict security measures enforced
- **Environment Detection**: Automatic security level adjustment

### Customization
Security settings can be customized via environment variables:
- `BCRYPT_SALT_ROUNDS`: Password hashing strength
- `SESSION_TIMEOUT`: Session duration
- `MAX_LOGIN_ATTEMPTS`: Login attempt limits
- `LOCKOUT_DURATION`: Account lockout duration

## 📞 Security Support

For security issues or questions:
1. Review this documentation
2. Check the logs for error details
3. Contact the development team
4. Report security vulnerabilities immediately

---

**Last Updated**: December 2024
**Version**: 1.0.0 