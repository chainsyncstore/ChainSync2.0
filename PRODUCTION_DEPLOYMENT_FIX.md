# Production Deployment Fix for ChainSync

## Issue
Login works locally but fails on the production site (https://chainsync.store) with 401 Unauthorized errors.

## Root Causes
1. **Code changes not deployed** - The storage.ts fixes need to be deployed to production
2. **Production database** - The admin user may not exist or have different credentials in production
3. **Environment variables** - Production environment may be missing critical configurations

## Immediate Fixes Required

### 1. Deploy the Storage Fix
The production code needs the updated `server/storage.ts` file with the proper field mapping.

### 2. Create Production Admin User

Create a script to run on the production database:

```sql
-- Check if admin exists
SELECT id, email, is_admin, email_verified 
FROM users 
WHERE email = 'admin@chainsync.com';

-- If not exists, create admin user (run this in your production database console)
-- First, generate password hash locally using bcrypt
-- Password: Admin123! 
-- Hash: $2b$10$d6LsJK0YBPEbKyYsl/BRDuxOp.wYJSTbBWCPXWQvaF1oU8AKoII/q

INSERT INTO users (
    email, 
    password_hash, 
    is_admin, 
    email_verified,
    requires_2fa,
    created_at
) VALUES (
    'admin@chainsync.com',
    '$2b$10$d6LsJK0YBPEbKyYsl/BRDuxOp.wYJSTbBWCPXWQvaF1oU8AKoII/q',
    true,
    true,
    false,
    NOW()
) ON CONFLICT (email) 
DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    is_admin = true,
    email_verified = true;
```

### 3. Environment Variables on Render

Ensure these environment variables are set in your Render dashboard:

```bash
DATABASE_URL=<your_production_database_url>
REDIS_URL=<optional_or_leave_empty>
SESSION_SECRET=<generate_secure_random_string>
JWT_SECRET=<generate_secure_random_string>
APP_URL=https://chainsync.store
BASE_URL=https://chainsync.store
FRONTEND_URL=https://chainsync.store
CORS_ORIGINS=https://chainsync.store
NODE_ENV=production
```

### 4. Create Production Seed Script

Create `scripts/seed-production-admin.mjs`:

```javascript
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createProductionAdmin() {
  const email = 'admin@chainsync.com';
  const password = 'Admin123!'; // Change this after first login!
  
  try {
    const client = await pool.connect();
    
    // Check if admin exists
    const existingResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`Admin user exists, updating password...`);
      const passwordHash = await bcrypt.hash(password, 10);
      
      await client.query(
        `UPDATE users 
         SET password_hash = $1, is_admin = true, email_verified = true 
         WHERE email = $2`,
        [passwordHash, email]
      );
      
      console.log('✅ Admin password updated!');
    } else {
      // Create new admin
      const passwordHash = await bcrypt.hash(password, 10);
      
      await client.query(
        `INSERT INTO users (
          email, password_hash, is_admin, email_verified, requires_2fa, created_at
        ) VALUES ($1, $2, true, true, false, NOW())
        RETURNING id, email`,
        [email, passwordHash]
      );
      
      console.log('✅ Admin user created!');
    }
    
    console.log('\n📧 Login credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    
    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

// Only run if DATABASE_URL is set
if (process.env.DATABASE_URL) {
  createProductionAdmin();
} else {
  console.error('DATABASE_URL not set!');
  process.exit(1);
}
```

## Deployment Steps

### Step 1: Commit and Push Changes
```bash
git add .
git commit -m "Fix authentication field mapping for production"
git push origin main
```

### Step 2: Trigger Deployment on Render
1. Go to your Render dashboard
2. Navigate to your service
3. Click "Manual Deploy" → "Deploy latest commit"

### Step 3: Run Production Admin Seed
After deployment completes:

#### Option A: Using Render Shell
1. In Render dashboard, go to "Shell" tab
2. Run: `node scripts/seed-production-admin.mjs`

#### Option B: Using Local Machine with Production Database
```bash
# Set production DATABASE_URL
set DATABASE_URL=<your_production_database_url>
node scripts/seed-production-admin.mjs
```

### Step 4: Verify Deployment
1. Check deployment logs in Render dashboard
2. Test login at https://chainsync.store/login
3. Check browser console for errors

## Monitoring Checklist

After deployment, verify:

- [ ] Server starts without Redis errors
- [ ] Database connection successful
- [ ] Admin user can log in
- [ ] Session cookies are set correctly
- [ ] CORS headers allow your domain

## Debugging Production Issues

### Check Render Logs
```bash
# In Render dashboard → Logs tab
# Look for:
- Database connection errors
- Field mapping logs
- Authentication errors
```

### Test Authentication Endpoint
```javascript
// Run in browser console at https://chainsync.store
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@chainsync.com',
    password: 'Admin123!'
  })
}).then(r => r.json()).then(console.log);
```

### Common Issues and Solutions

1. **"Invalid email or password"**
   - Admin user doesn't exist in production
   - Password hash is incorrect
   - Solution: Run seed-production-admin.mjs

2. **"Connection terminated unexpectedly"**
   - Database connection issue
   - Solution: Check DATABASE_URL in Render environment

3. **No session cookie set**
   - SESSION_SECRET not configured
   - Solution: Set SESSION_SECRET in Render dashboard

4. **CORS errors**
   - CORS_ORIGINS misconfigured
   - Solution: Set CORS_ORIGINS=https://chainsync.store

## Security Notes

1. **Change default admin password immediately after first login**
2. **Use strong, unique SESSION_SECRET and JWT_SECRET in production**
3. **Enable 2FA for admin accounts**
4. **Regularly rotate secrets**

## Emergency Rollback

If issues persist:
1. In Render dashboard → "Deploy History"
2. Click on previous working deployment
3. Select "Rollback to this deploy"
