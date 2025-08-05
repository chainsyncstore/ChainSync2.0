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
# Database Configuration
DATABASE_URL="your-postgresql-connection-string"

# Google Cloud Storage (optional - for file uploads)
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_CLOUD_BUCKET_NAME="your-bucket-name"
GOOGLE_CLOUD_PRIVATE_KEY="your-private-key"
GOOGLE_CLOUD_CLIENT_EMAIL="your-client-email"

# Session Secret (for authentication)
SESSION_SECRET="your-random-secret-key"

# Port Configuration
PORT=5000
```

## Step 3: Database Setup

Run the following commands to set up your database:

```bash
# Push the database schema
npm run db:push

# Seed the database with sample data
npx tsx scripts/seed.ts
```

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

## Default Login Credentials

After seeding the database, you can log in with:

- **Manager Account**:
  - Username: `manager1`
  - Email: `john@chainsync.com`
  - Role: Manager

- **Cashier Account**:
  - Username: `cashier1`
  - Email: `alice@chainsync.com`
  - Role: Cashier

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