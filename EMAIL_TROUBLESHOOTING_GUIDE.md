# Email Service Troubleshooting Guide

## Current Issues Identified

Based on the build logs, there are two main issues preventing emails from being sent:

### 1. IPv6 Rate Limiting Validation Errors ✅ FIXED

**Error:**
```
ValidationError: Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses
```

**Fix Applied:**
- Updated `server/middleware/security.ts` to import and use the `ipKeyGenerator` helper from `express-rate-limit`
- This ensures proper IPv6 address handling in all rate limiting middleware

### 2. SMTP Authentication Failure ❌ NEEDS CONFIGURATION

**Error:**
```
SMTP transporter verification failed: Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

**Root Cause:**
The Gmail SMTP credentials configured in Render are either:
- Using a regular Gmail password (no longer supported)
- Missing or incorrect App Password
- Incorrect email address

## Solution: Configure Gmail App Password

### Step 1: Enable 2-Factor Authentication on Gmail

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google," select "2-Step Verification"
3. Follow the prompts to enable 2FA

### Step 2: Generate App Password

1. Return to [Google Account Security](https://myaccount.google.com/security)
2. Click on "App Passwords" (only appears after 2FA is enabled)
3. Select "Other (Custom name)" from dropdown
4. Enter "ChainSync Production" as the app name
5. Click "Generate"
6. Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

### Step 3: Update Render Environment Variables

In your Render dashboard, update these environment variables:

```bash
# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=noreply@chainsync.store
```

**Important Notes:**
- `SMTP_USER` must be your actual Gmail address
- `SMTP_PASS` must be the 16-character App Password (remove spaces)
- `SMTP_FROM` can be different from `SMTP_USER` for branding

### Step 4: Alternative Email Providers

If Gmail continues to have issues, consider these alternatives:

#### SendGrid (Recommended for Production)
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@chainsync.store
```

#### Mailgun
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
SMTP_FROM=noreply@chainsync.store
```

#### AWS SES
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-access-key
SMTP_PASS=your-ses-secret-key
SMTP_FROM=noreply@chainsync.store
```

## Testing Email Configuration

### Option 1: Check Render Logs
After updating the environment variables and redeploying:
```
==> Deploying...
==> Running 'npm run start'
...
{"timestamp":"...","level":"info","message":"SMTP transporter verified successfully."}
```

### Option 2: Manual Test Script
Create a test script to verify email sending:

```javascript
// test-email.js
import { sendEmail } from './server/email.js';

const testEmail = {
  to: 'test@example.com',
  subject: 'Test Email from ChainSync',
  html: '<p>If you receive this, email configuration is working!</p>',
  text: 'If you receive this, email configuration is working!'
};

sendEmail(testEmail)
  .then(success => {
    console.log('Email test result:', success ? 'SUCCESS' : 'FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Email test error:', error);
    process.exit(1);
  });
```

## Email Features in ChainSync

The following features depend on email service:

1. **Welcome emails** - Sent after successful user registration
2. **Password reset emails** - Sent when users request password reset
3. **Password reset confirmation** - Sent after successful password change
4. **Email verification** (if `REQUIRE_EMAIL_VERIFICATION=true`)

## Current Email Configuration

The system is configured to:
- Use Gmail SMTP by default (`smtp.gmail.com:587`)
- Fall back gracefully if email fails (logs error but continues)
- Support HTML and text email formats
- Include proper branding and styling

## Security Considerations

1. **Never commit email credentials** to version control
2. **Use App Passwords** instead of regular Gmail passwords
3. **Monitor email sending** for abuse/spam
4. **Consider rate limiting** email sending per user
5. **Use professional email service** for production (SendGrid, Mailgun, etc.)

## Next Steps

1. ✅ Fix IPv6 rate limiting errors (completed)
2. ❌ Configure Gmail App Password in Render environment variables
3. ❌ Test email functionality after deployment
4. ❌ Consider migrating to professional email service for better deliverability

## Troubleshooting Checklist

- [ ] Gmail 2FA is enabled
- [ ] App Password is generated and copied correctly
- [ ] Render environment variables are updated with correct credentials
- [ ] Application has been redeployed after environment variable changes
- [ ] Check Render logs for SMTP verification success message
- [ ] Test email sending with a real email address

---

**Status:** IPv6 rate limiting fixed ✅, SMTP authentication needs configuration ❌
