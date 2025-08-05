# Forgot Password Setup Guide

This guide explains how to set up the forgot password functionality in ChainSync.

## Features Added

1. **Forgot Password Flow**: Users can request a password reset via email
2. **Password Reset Tokens**: Secure, time-limited tokens for password reset
3. **Email Integration**: Automated email sending for password reset requests
4. **Frontend Components**: User-friendly forms for the entire flow

## Database Changes

A new table `password_reset_tokens` has been added to store reset tokens with the following fields:
- `id`: Unique identifier
- `user_id`: Reference to the user
- `token`: Secure random token
- `expires_at`: Token expiration time (24 hours)
- `is_used`: Whether the token has been used
- `created_at`: Token creation timestamp

## Email Configuration

To enable email functionality, you need to configure SMTP settings. Create a `.env` file in the root directory with the following variables:

```env
# Email Configuration for Password Reset
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Frontend URL (used in password reset emails)
FRONTEND_URL=http://localhost:5173
```

### Gmail Setup (Recommended)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use the generated password as `SMTP_PASS`

### Other Email Providers

You can use any SMTP provider. Common alternatives:
- **Outlook/Hotmail**: `smtp-mail.outlook.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **Custom SMTP**: Use your provider's SMTP settings

## API Endpoints

### POST /api/auth/forgot-password
Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

### POST /api/auth/reset-password
Reset password using a valid token.

**Request Body:**
```json
{
  "token": "reset_token_here",
  "newPassword": "new_password_here"
}
```

**Response:**
```json
{
  "message": "Password has been successfully reset"
}
```

### GET /api/auth/validate-reset-token/:token
Validate a reset token.

**Response:**
```json
{
  "message": "Token is valid"
}
```

## Frontend Routes

- `/login` - Login page with "Forgot Password" link
- `/reset-password?token=xxx` - Password reset page (accessed via email link)

## Security Features

1. **Token Expiration**: Reset tokens expire after 24 hours
2. **Single Use**: Tokens can only be used once
3. **Secure Generation**: Tokens are cryptographically secure random strings
4. **Email Privacy**: The system doesn't reveal whether an email exists
5. **Password Validation**: Minimum 8 characters required

## Testing the Functionality

1. Start the application with email configuration
2. Go to the login page
3. Click "Forgot your password?"
4. Enter an email address
5. Check the email for the reset link
6. Click the link to reset the password
7. Enter a new password and confirm

## Troubleshooting

### Email Not Sending
- Check SMTP configuration in `.env`
- Verify email credentials
- Check firewall/network settings
- Review server logs for error messages

### Token Validation Failing
- Ensure the token hasn't expired (24 hours)
- Check if the token has already been used
- Verify the token format in the URL

### Database Issues
- Run `npm run db:push` to ensure schema is up to date
- Check database connection
- Verify the `password_reset_tokens` table exists

## Production Considerations

1. **Environment Variables**: Use proper environment variables for all sensitive data
2. **Email Provider**: Use a reliable email service (SendGrid, Mailgun, etc.)
3. **Rate Limiting**: Implement rate limiting for password reset requests
4. **Logging**: Add proper logging for security events
5. **HTTPS**: Ensure all communication uses HTTPS
6. **Password Hashing**: In production, implement proper password hashing (bcrypt)

## Files Modified/Created

### Backend
- `shared/schema.ts` - Added password reset tokens table
- `server/storage.ts` - Added password reset methods
- `server/routes.ts` - Added password reset API endpoints
- `server/email.ts` - New email service utility

### Frontend
- `client/src/components/auth/forgot-password.tsx` - Forgot password form
- `client/src/components/auth/reset-password.tsx` - Password reset form
- `client/src/components/auth/login.tsx` - Added forgot password link
- `client/src/App.tsx` - Added routing for password reset flow 