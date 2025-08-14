# MailerSend Setup Guide for ChainSync

## Overview
This guide explains how to configure ChainSync to use MailerSend as your email service provider instead of Gmail.

## Why MailerSend?
- **Better deliverability** for business emails
- **Higher sending limits** compared to Gmail
- **Professional SMTP service** with dedicated IP options
- **Better analytics** and email tracking
- **Compliance** with email regulations

## Step 1: Create MailerSend Account
1. Go to [mailersend.com](https://mailersend.com)
2. Sign up for a free account
3. Verify your email address
4. Complete your account setup

## Step 2: Get SMTP Credentials
1. Log into your MailerSend dashboard
2. Go to **Settings** → **SMTP**
3. Note down the following information:
   - **SMTP Host**: `smtp.mailersend.net`
   - **SMTP Port**: `587` (or `465` for SSL)
   - **Username**: Your MailerSend username
   - **Password**: Your MailerSend API key

## Step 3: Update Environment Variables

### Local Development (.env file)
```bash
# Email Configuration
SMTP_HOST=smtp.mailersend.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mailersend-username
SMTP_PASS=your-mailersend-api-key
SMTP_FROM=noreply@yourdomain.com
```

### Production (Render Dashboard)
1. Go to your Render dashboard
2. Navigate to your ChainSync service
3. Go to **Environment** tab
4. Add/update these environment variables:
   - `SMTP_HOST`: `smtp.mailersend.net`
   - `SMTP_PORT`: `587`
   - `SMTP_SECURE`: `false`
   - `SMTP_USER`: Your MailerSend username
   - `SMTP_PASS`: Your MailerSend API key
   - `SMTP_FROM`: `noreply@yourdomain.com`

## Step 4: Verify Configuration
After updating your environment variables, restart your application and test the email functionality:

1. **Test Email Sending**: Try the signup process or password reset
2. **Check Logs**: Monitor your application logs for email-related errors
3. **Verify in MailerSend**: Check your MailerSend dashboard for sent emails

## Step 5: Domain Verification (Optional but Recommended)
1. In MailerSend dashboard, go to **Settings** → **Domains**
2. Add your domain (e.g., `chainsync.com`)
3. Follow the DNS verification steps
4. This improves email deliverability and allows you to send from `@yourdomain.com`

## MailerSend SMTP Settings Summary
```
Host: smtp.mailersend.net
Port: 587 (TLS) or 465 (SSL)
Security: STARTTLS (port 587) or SSL (port 465)
Authentication: Username + API Key
```

## Troubleshooting

### Common Issues

#### 1. Authentication Failed
- Verify your username and API key are correct
- Ensure your MailerSend account is active
- Check if your API key has SMTP permissions

#### 2. Connection Timeout
- Verify the SMTP host and port are correct
- Check your firewall/network settings
- Try using port 465 with SSL if 587 doesn't work

#### 3. Emails Not Sending
- Check your MailerSend sending limits
- Verify your `SMTP_FROM` address is authorized
- Check MailerSend dashboard for any account restrictions

### Testing Commands
You can test your SMTP configuration using these commands:

```bash
# Test SMTP connection (replace with your actual credentials)
telnet smtp.mailersend.net 587

# Or use openssl for SSL connection
openssl s_client -connect smtp.mailersend.net:587 -starttls smtp
```

## Migration Checklist
- [ ] Updated `server/email.ts` with MailerSend configuration
- [ ] Updated `env.example` with MailerSend settings
- [ ] Updated `render.env.example` with MailerSend settings
- [ ] Set environment variables in your local `.env` file
- [ ] Set environment variables in Render dashboard (production)
- [ ] Tested email functionality
- [ ] Verified emails are being sent through MailerSend
- [ ] Updated team documentation

## Support
- **MailerSend Support**: [support.mailersend.com](https://support.mailersend.com)
- **ChainSync Issues**: Check your application logs and MailerSend dashboard
- **SMTP Testing**: Use online SMTP testing tools to verify configuration

## Next Steps
After successful setup:
1. Monitor email delivery rates in MailerSend dashboard
2. Set up email templates if needed
3. Configure webhooks for email events
4. Consider upgrading to a paid plan for higher limits
