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

# Google Cloud Storage (optional - for file uploads)
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_CLOUD_BUCKET_NAME="your-bucket-name"
GOOGLE_CLOUD_PRIVATE_KEY="your-private-key"
GOOGLE_CLOUD_CLIENT_EMAIL="your-client-email"
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
npm run dev

# Or build and start in production mode
npm run build
npm start
```

## Step 5: Access the Application

Open your browser and navigate to:
- **Development**: http://localhost:5000
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

## Features Available

- **POS System**: Real-time sales and inventory management
- **Inventory Management**: Track stock levels and set alerts
- **Analytics Dashboard**: Sales reports and performance metrics
- **Multi-Store Support**: Manage multiple store locations
- **User Management**: Role-based access control
- **Data Import**: CSV upload for bulk data migration 