### **5. Webhook Delivery Logs**
- Check provider dashboards (Paystack/Flutterwave) for delivery attempts and signatures.

## ⚡ Webhook Troubleshooting (Paystack/Flutterwave)

- Ensure raw-body endpoints are used: `/webhooks/*` or `/api/payment/*-webhook`.
- Required headers:
  - Paystack: `x-paystack-signature`
  - Flutterwave: `verif-hash`
- Add `x-event-id` and `x-event-timestamp` for idempotency and replay protection.
- Verify secrets in env: `WEBHOOK_SECRET_PAYSTACK`, `WEBHOOK_SECRET_FLW`.
- Duplicate events return idempotent responses; check logs/DB before retrying.

## 📴 Offline Sync Troubleshooting

- Endpoints: `/api/sync/upload`, `/api/sync/download`, `/api/sync/status`.
- Confirm auth cookie is present and CSRF token is valid for `/api`.
- Check conflict responses and use `/api/sync/resolve-conflicts` as needed.

## ✉️ SMTP Verification

- On startup, `server/index.ts` verifies the transporter.
- Success message: "SMTP transporter verified successfully"; otherwise check `SMTP_*` env and see `EMAIL_TROUBLESHOOTING_GUIDE.md`.
# Render Deployment Troubleshooting Guide

## 🚨 **Critical Issues & Solutions**

### **1. "Connection failed. Please check your internet connection" Error**

#### **Root Cause Analysis**
This error typically occurs when:
- Database connection fails
- CSRF token generation fails
- Session store connection issues
- Environment variables not properly configured

#### **Immediate Solutions**

##### **Step 1: Check Environment Variables in Render Dashboard**
1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Ensure these variables are set:
```env
NODE_ENV=production
PORT=5000
APP_URL=https://your-app.onrender.com
CORS_ORIGINS=https://your-app.onrender.com,https://www.yourdomain.com
DATABASE_URL=your_database_connection_string
SESSION_SECRET=your_secure_session_secret
# Optional in prod: JWT_SECRET
# Required in prod: REDIS_URL
```

##### **Step 2: Verify Database Connection**
1. Check if your database is accessible from Render
2. Ensure `sslmode=require` is in your DATABASE_URL
3. Test connection string format:
   ```
   postgresql://username:password@host:port/database?sslmode=require
   ```

##### **Step 3: Check Render Logs**
1. In Render dashboard, go to "Logs" tab
2. Look for database connection errors
3. Check for missing environment variable errors

### **2. "Signup failed. Please try again or contact support" Error**

#### **Root Cause Analysis**
This error occurs when:
- Database operations fail
- Email service fails
- Validation errors
- Rate limiting issues

#### **Immediate Solutions**

##### **Step 1: Test Health Check Endpoints**
Visit liveness: `https://your-app.onrender.com/healthz`
Visit detailed: `https://your-app.onrender.com/api/observability/health`

Expected liveness response:
```json
{
  "ok": true,
  "uptime": 123.45,
  "email": {"verified": true, ...}
}
```
For detailed health, ensure `database.status` is `connected`; if not, check `DATABASE_URL` and network/SSL.

##### **Step 2: Check Database Schema**
Ensure your database has the required tables:
```sql
-- Check if users table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'users'
);

-- Check if sessions table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'sessions'
);
```

##### **Step 3: Verify Database Permissions**
Ensure your database user has:
- CREATE permissions
- INSERT permissions
- SELECT permissions
- USAGE permissions on schema

### **3. CORS/CSRF Issues**

#### **Symptoms**
- Browser console shows CORS errors
- Requests blocked by browser
- "Origin not allowed" errors

#### **Solutions**

##### **Step 1: Check CORS Configuration**
Configured in `server/middleware/security.ts` using `CORS_ORIGINS` from env. Verify:
1. Your frontend origin is present in `CORS_ORIGINS`
2. Requests are sent with credentials as needed
3. No mixed HTTP/HTTPS between frontend/backend

##### **Step 2: Test CORS with Browser DevTools**
1. Open browser DevTools
2. Go to Network tab
3. Try to signup
4. Look for CORS errors in console

### **4. Session/CSRF Issues**

#### **Symptoms**
- "CSRF token is required" errors
- Session not persisting
- Authentication failures

#### **Solutions**

##### **Step 1: Verify Session Configuration**
Ensure these environment variables are set:
```env
SESSION_SECRET=your_secure_session_secret
```

##### **Step 2: Check Cookie Settings**
The app automatically sets secure cookies in production:
- `secure: true` (HTTPS only)
- `httpOnly: true`
- `sameSite: 'strict'`

### **5. Database Connection Pool Issues**

#### **Symptoms**
- Intermittent connection failures
- Timeout errors
- "Connection refused" errors

#### **Solutions**

##### **Step 1: Check Database Pool Configuration**
The app now includes enhanced connection pooling:
- Max connections: 20
- Connection timeout: 10 seconds
- Idle timeout: 30 seconds
- SSL enabled for production

##### **Step 2: Monitor Connection Health**
Check logs for:
- "Database client connected"
- "Database client acquired from pool"
- "Database connection error"

## 🔧 **Deployment Verification Steps**

### **Step 1: Pre-Deployment Checklist**
- [ ] All environment variables set in Render
- [ ] Database accessible from Render
- [ ] Database schema up to date
- [ ] Strong secrets generated

### **Step 2: Post-Deployment Verification**
- [ ] `/healthz` responds with `{ ok: true }`
- [ ] `/api/observability/health` shows database `connected`
- [ ] No CORS errors in browser console
- [ ] Signup form loads without errors

### **Step 3: Functional Testing**
- [ ] Signup form loads
- [ ] Form validation works
- [ ] Database connection established
- [ ] User creation succeeds
- [ ] Email verification sent (if configured)

## 📋 **Environment Variable Checklist**

### **Required Variables**
```env
NODE_ENV=production
PORT=5000
APP_URL=https://your-app.onrender.com
CORS_ORIGINS=https://your-app.onrender.com,https://www.yourdomain.com
DATABASE_URL=postgresql://user:pass@host:port/db?sslmode=require
SESSION_SECRET=64-character-random-string
# Production requirement
REDIS_URL=redis://default:pass@host:6379
```

### **Optional Variables**
```env
# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@chainsync.store

# Payment webhooks
WEBHOOK_SECRET_PAYSTACK=...
WEBHOOK_SECRET_FLW=...
```

## 🚀 **Quick Fix Commands**

### **Generate Secure Secrets**
```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# (Optional) Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### **Test Database Connection**
```bash
# Test with psql
psql "your-database-url"

# Test with node
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'your-database-url' });
pool.query('SELECT 1', (err, res) => {
  if (err) console.error('Connection failed:', err);
  else console.log('Connection successful:', res.rows[0]);
  pool.end();
});
"
```

## 📞 **Support Information**

### **When to Contact Support**
- Health endpoints show database "disconnected"
- All environment variables are correct
- Database is accessible from other clients
- Render logs show no obvious errors

### **Information to Provide**
- Render service URL
- Health check endpoint response
- Browser console errors
- Render service logs
- Environment variable configuration (without secrets)

## 🔍 **Debugging Tools**

### **1. Health Endpoints**
- Liveness: `/healthz`
- Detailed: `/api/observability/health` (DB latency, memory, uptime, version)

### **2. Render Logs**
- Real-time application logs
- Database connection logs
- Error stack traces
- Request/response logs

### **3. Browser DevTools**
- Network tab for API calls
- Console for JavaScript errors
- Application tab for cookies/session

### **4. Database Logs**
- Connection attempts
- Query performance
- Error messages
- Connection pool status
