# ChainSync Local Deployment Guide

## Prerequisites

1. **Node.js** (version 18 or higher)
2. **PostgreSQL Database** (you can use Neon, Supabase, or local PostgreSQL)

## Step 1: Database Setup

### Option A: Using Neon (Recommended)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string from your project dashboard
4. The connection string looks like: `postgresql://username:password@host:port/database`

### Option B: Using Local PostgreSQL
1. Install PostgreSQL on your system
2. Create a new database
3. Use connection string: `postgresql://username:password@localhost:5432/chainsync`

## Step 2: Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration (REQUIRED)
DATABASE_URL="your-postgresql-connection-string"

# Session Security (REQUIRED for production)
SESSION_SECRET="your-super-secure-random-session-secret-key"

# Environment
NODE_ENV="production"

# Port Configuration
PORT=5000
```

**Important Security Notes:**
- Generate a strong SESSION_SECRET using: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Never commit your `.env` file to version control
- Use different secrets for development and production

## Step 3: Database Setup

Run the following commands to set up your database:

```bash
# Push the database schema
npm run db:push

# Seed the database with secure users (RECOMMENDED for production)
npm run seed:secure

# OR seed with demo users (for development only)
npm run seed:demo
```

**Security Note:** The secure seed script generates random passwords and displays them in the console. Save these credentials securely!

## Step 4: Start the Application

```bash
# Development mode (with hot reload)
npm run dev:server   # backend on http://localhost:5000
npm run dev:web      # frontend on http://localhost:5173

# Or build and start in production mode
npm run build
npm start
```

## Step 5: Access the Application

Open your browser and navigate to:
- **Frontend (dev)**: http://localhost:5173
- **Backend API (dev)**: http://localhost:5000
- **Production**: http://localhost:5000

## Login Credentials

### For Secure Users (Production)
After running `npm run seed:secure`, the console will display secure credentials like:
```
Admin: admin / Kx9#mP2$vL8@nQ5
Manager: manager / R7#jH4$tY9@wE2
Cashier: cashier / B3#fN6$mK1@xP8
```

**IMPORTANT:** Save these credentials securely and change them after first login!

### For Demo Users (Development)
After running `npm run seed:demo`, you can use:
- **Admin**: `admin` / `admin123`
- **Manager**: `manager` / `manager123`
- **Cashier**: `cashier` / `cashier123`

**WARNING:** Demo credentials should NEVER be used in production!

## Troubleshooting

### Database Connection Issues
- Verify your `DATABASE_URL` is correct
- Ensure your database is accessible from your network
- Check if your database supports SSL connections

### Port Already in Use
- Change the `PORT` environment variable
- Or kill the process using the current port

### Build Issues
- Clear the `dist` folder: `rm -rf dist`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Environment Configuration (Source of Truth)

- Canonical schema: `shared/env.ts`.
- Required: `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `CORS_ORIGINS`.
- Production-only requirements: `REDIS_URL`, `SESSION_SECRET` length ≥ 32, and `CORS_ORIGINS` must parse to at least one valid http(s) origin.
- Optional (dev): payment keys (Paystack/Flutterwave), WebSocket, AI, offline flags.

Early-boot guardrails:
- On production start, an env check runs automatically (npm `prestart` and `prestart:render`).
- Startup aborts with a clear error if any production requirement is missing/invalid. Example:
  - `Invalid environment configuration: REDIS_URL, SESSION_SECRET (must be at least 32 characters in production) required in production`

Example .env for local dev:
```env
APP_URL=http://localhost:5000
CORS_ORIGINS=http://localhost:5173,http://localhost:5000
DATABASE_URL=postgresql://user:pass@localhost:5432/chainsync
SESSION_SECRET=change-me-dev-secret
```

## Health and Metrics

- Liveness: `GET /healthz` (see `server/api/index.ts`).
- Detailed health: `GET /api/observability/health` with DB latency, memory, uptime (see `server/api/routes.observability.ts`).
- Metrics (admin): `GET /api/observability/metrics` and related endpoints.

## Webhooks (Payments)

- Raw-body endpoints (see `server/api/routes.webhooks.ts`):
  - Paystack: `POST /webhooks/paystack`, `POST /api/payment/paystack-webhook`
  - Flutterwave: `POST /webhooks/flutterwave`, `POST /api/payment/flutterwave-webhook`
- Headers:
  - Common: `x-event-id`, `x-event-timestamp`
  - Paystack: `x-paystack-signature` (HMAC-SHA512)
  - Flutterwave: `verif-hash` (HMAC-SHA256)
- Env secrets: `WEBHOOK_SECRET_PAYSTACK`, `WEBHOOK_SECRET_FLW` (or provider secret keys).

## Offline Sync

Key endpoints (see `server/api/routes.offline-sync.ts`):
- `POST /api/sync/upload`
- `GET /api/sync/download`
- `GET /api/sync/status`
- `POST /api/sync/resolve-conflicts`
- `GET /api/sync/health`

## Triage Runbooks (Quick)

- CSRF/CORS:
  1) Confirm `CORS_ORIGINS` contains frontend origin. 2) Call `GET /api/auth/csrf-token` and check cookie/header. 3) Review `server/middleware/security.ts`.
- Webhooks:
  1) Check signature headers present. 2) Verify secrets in env. 3) Look for idempotent responses in logs/DB.
- SMTP:
  1) Verify `SMTP_*` vars. 2) Check startup logs for transporter verification. 3) See `EMAIL_TROUBLESHOOTING_GUIDE.md`.

## Features Available

- **POS System**: Real-time sales and inventory management
- **Inventory Management**: Track stock levels and set alerts
- **Analytics Dashboard**: Sales reports and performance metrics
- **Multi-Store Support**: Manage multiple store locations
- **User Management**: Role-based access control
- **Data Import**: CSV upload for bulk data migration