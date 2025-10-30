# ChainSync 2.0 - Comprehensive Authentication System Trace

## Overview
Complete authentication flow tracing from HTTP login endpoint through password verification, Redis session management, and PostgreSQL database operations.

---

## 1. HTTP Login Endpoint Flow

### 1a. Login Endpoint Definition
**Location:** `routes.auth.ts:229`
```typescript
app.post('/api/auth/login', 
  authRateLimit,                                    // Rate limiting protection
  botPreventionMiddleware({                         // Bot prevention layer
    required: false, 
    expectedAction: 'login' 
  }), 
  async (req: Request, res: Response) => {
```
- **Security Layers:**
  - Rate limiting via `authRateLimit` middleware
  - Bot prevention checks (optional CAPTCHA)
  - Request ID tracking for audit trail

### 1b. Input Validation & User Lookup
**Location:** `routes.auth.ts:230-259`

**Validation Schema:** (`server/schemas/auth.ts:72-81`)
```typescript
const LoginSchema = z.union([
  z.object({
    email: emailSchema,
    password: z.string().min(8)
  }),
  z.object({
    username: z.string().min(3),
    password: z.string().min(8)
  })
]);
```

**User Lookup Logic:**
```typescript
// Flexible lookup supporting both email and username
if (email) {
  user = await storage.getUserByEmail(email);
} else if (username) {
  const hasGetByUsername = typeof (storage as any).getUserByUsername === 'function';
  user = hasGetByUsername
    ? await (storage as any).getUserByUsername(username)
    : await storage.getUserByEmail(username);  // Fallback
}
```

### 1c. Password Verification
**Location:** `routes.auth.ts:291-303`
```typescript
// Handle multiple password field formats for compatibility
const storedHash = 
  (user as any).password_hash ??    // PostgreSQL snake_case
  (user as any).passwordHash ??     // JavaScript camelCase
  (user as any).password;            // Legacy field

// Bcrypt comparison
isPasswordValid = storedHash 
  ? await bcrypt.compare(password!, String(storedHash)) 
  : false;
```

### 1d. Session Creation
**Location:** `routes.auth.ts:335-342`
```typescript
await new Promise<void>((resolve, reject) => {
  req.session!.regenerate((err) => {           // Regenerate session ID
    if (err) return reject(err);
    req.session!.userId = user.id;             // Store user ID
    req.session!.twofaVerified = false;        // 2FA status
    req.session!.save((err2) =>                // Persist to Redis
      err2 ? reject(err2) : resolve()
    );
  });
});
```

### 1e. Success Response
**Location:** `routes.auth.ts:345-350`
```typescript
const { password: _, ...userData } = user;     // Strip sensitive data
res.json({ 
  status: 'success',
  message: 'Login successful', 
  user: userData                              // Return safe user data
});
```

---

## 2. Security Enforcement Layer

### 2a. Password Strength Validation
**Location:** `auth-enhanced.ts:59-64`
```typescript
static async hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(password, authConfig.saltRounds);  // 12 rounds
}
```

### 2b. Account Lockout Verification
**Location:** `auth-enhanced.ts:76-100`
```typescript
static async isAccountLocked(userId: string): Promise<{ 
  locked: boolean; 
  lockoutUntil?: Date 
}> {
  const user = await db.select().from(users).where(eq(users.id, userId));
  
  // Check active lockout
  if (userData.lockedUntil && userData.lockedUntil > new Date()) {
    return { locked: true, lockoutUntil: userData.lockedUntil };
  }
  
  // Auto-lock after max attempts (5)
  if (userData.failedLoginAttempts >= authConfig.maxLoginAttempts) {
    const lockoutUntil = new Date(Date.now() + authConfig.lockoutDuration);
    await db.update(users)
      .set({ lockedUntil: lockoutUntil })
      .where(eq(users.id, userId));
    return { locked: true, lockoutUntil };
  }
}
```

### 2c. Failed Login Tracking
**Location:** `auth-enhanced.ts:106-153`
```typescript
static async recordFailedLogin(
  userId: string, 
  username: string, 
  ipAddress: string, 
  reason: string
): Promise<void> {
  // Increment counter
  const newAttempts = (userData.failedLoginAttempts || 0) + 1;
  
  // Update user record
  await db.update(users).set({ 
    failedLoginAttempts: newAttempts,
    lastFailedLogin: new Date()
  }).where(eq(users.id, userId));
  
  // Log to audit table
  await db.insert(accountLockoutLogs).values({
    userId, username, ipAddress,
    action: 'login_attempt',
    success: false,
    reason,
    createdAt: new Date()
  });
  
  // Auto-lock if threshold reached
  if (newAttempts >= authConfig.maxLoginAttempts) {
    const lockoutUntil = new Date(Date.now() + authConfig.lockoutDuration);
    await db.update(users)
      .set({ lockedUntil: lockoutUntil })
      .where(eq(users.id, userId));
  }
}
```

### 2d. Security Alert Emails
**Location:** `routes.auth.ts:276-283, 316-324`
```typescript
// Send security alerts on failed login attempts
try {
  const { sendEmail } = await import('../email');
  await sendEmail({
    to: email || username || '',
    subject: 'Security Alert: Failed Login Attempt',
    html: `<p>There was a failed login attempt for your account. 
           If this was not you, please reset your password immediately.</p>`
  });
} catch (e) { 
  logger.error('Failed to send security alert email', e); 
}
```

---

## 3. Redis Session Management

### 3a. Redis Client Singleton
**Location:** `server/lib/redis.ts:5-22`
```typescript
export function getRedisClient(): RedisClientType | null {
  if (client) return client;
  
  // Local development bypass
  if (process.env.LOCAL_DISABLE_REDIS === 'true') {
    return null;
  }
  
  const url = process.env.REDIS_URL;
  if (!url) return null;
  
  client = createClient({ url }) as RedisClientType;
  client.on('error', (err) => {
    console.error('Redis Client Error', err);
  });
  
  // Non-blocking connect
  client.connect().catch(() => {});
  return client;
}
```

### 3b. Redis Store Configuration
**Location:** `server/session.ts:11-19`
```typescript
export function configureSession(
  redisUrl: string | undefined, 
  sessionSecret: string
) {
  let store: any | undefined;
  if (redisUrl) {
    const client = createRedisClient(redisUrl);
    client.connect().catch((e: any) => 
      console.error('Redis connect error', e)
    );
    store = new (RedisStore as any)({ 
      client, 
      prefix: 'chainsync:sess:'    // Namespaced sessions
    });
  }
```

### 3c. Express Session Configuration
**Location:** `server/session.ts:29-42`
```typescript
return session({
  ...(store ? { store } : {}),    // Use Redis or memory fallback
  secret: sessionSecret,
  resave: false,                  // Don't save unchanged sessions
  saveUninitialized: false,        // Don't create empty sessions
  name: 'chainsync.sid',           // Cookie name
  cookie: {
    httpOnly: true,                // No JS access
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
    sameSite: 'lax',               // CSRF protection
    maxAge: 1000 * 60 * 60 * 8,   // 8 hours
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  },
});
```

### 3d. Session Middleware Integration
**Location:** `server/api/index.ts:30-31`
```typescript
// Install session middleware early in request pipeline
const resolvedRedisUrl = 
  process.env.LOCAL_DISABLE_REDIS === 'true' 
    ? undefined 
    : env.REDIS_URL;
app.use(configureSession(resolvedRedisUrl, env.SESSION_SECRET));
```

### 3e. Session Data Type Definition
**Location:** `server/types/session.d.ts:6-12`
```typescript
interface SessionData {
  userId?: string;          // Primary user identifier
  pendingUserId?: string;   // For incomplete signups
  twofaVerified?: boolean;  // 2FA status
  orgId?: string;          // Organization context
  user?: {                 // Additional user context
    id?: string; 
    storeId?: string 
  } | undefined;
}
```

---

## 4. Database Layer Architecture

### 4a. Users Table Schema
**Location:** `shared/schema.ts:29-65`
```typescript
export const users = pgTable("users", {
  // Primary fields
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  
  // Security fields
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts"),
  
  // 2FA fields
  requires2fa: boolean("requires_2fa").notNull().default(false),
  totpSecret: varchar("totp_secret", { length: 255 }),
  
  // Profile fields
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  
  // Legacy compatibility
  password: varchar("password", { length: 255 }),  // Mirror field
}, (table) => ({
  orgIdx: index("users_org_idx").on(table.orgId),
  usernameUnique: uniqueIndex("users_username_unique").on(table.username),
  storeIdx: index("users_store_idx").on(table.storeId),
}));
```

### 4b. Storage Abstraction Layer
**Location:** `server/storage.ts:313-353`

**Database Query with Field Mapping:**
```typescript
async getUserByEmail(email: string): Promise<User | undefined> {
  // Test environment: in-memory storage
  if (this.isTestEnv) {
    for (const user of this.mem.users.values()) {
      if (user.email === email) return user;
    }
    return undefined;
  }
  
  // Production: PostgreSQL query
  const result = await db.execute(
    sql`SELECT * FROM users WHERE email = ${email}`
  );
  
  if (result.rows && result.rows.length > 0) {
    const user = result.rows[0];
    // Map snake_case to camelCase for compatibility
    const mappedUser = {
      ...user,
      passwordHash: user.password_hash,      // camelCase mapping
      password_hash: user.password_hash,     // Keep snake_case
      password: user.password_hash,          // Legacy field
      emailVerified: user.email_verified,
      email_verified: user.email_verified,
      isAdmin: user.is_admin,
      is_admin: user.is_admin,
    };
    return mappedUser;
  }
}
```

### 4c. Drizzle ORM Configuration
**Location:** `server/db.ts:85`
```typescript
export const db = drizzle({ 
  client: pool,    // Connection pool
  schema           // Type-safe schema
});
```

### 4d. Session Storage Table
**Location:** `shared/schema.ts:730-736`
```typescript
export const sessions = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),    // Session ID
  sess: text("sess").notNull(),                         // Serialized data
  expire: timestamp("expire").notNull(),                // TTL
}, (table) => ({
  expireIdx: index("session_expire_idx").on(table.expire),
}));
```

### 4e. Audit & Security Tables
**Account Lockout Logs:**
```typescript
export const accountLockoutLogs = pgTable("account_lockout_logs", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id"),
  username: varchar("username", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  action: varchar("action", { length: 50 }),
  success: boolean("success"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow()
});
```

---

## Request Flow Summary

```mermaid
graph TD
    A[Client Login Request] --> B[Rate Limiting]
    B --> C[Bot Prevention]
    C --> D[Input Validation]
    D --> E[User Lookup]
    E --> F{User Exists?}
    F -->|No| G[Security Alert + 400]
    F -->|Yes| H[Account Lock Check]
    H --> I{Locked?}
    I -->|Yes| J[Return 403 Locked]
    I -->|No| K[Password Comparison]
    K --> L{Valid?}
    L -->|No| M[Record Failed Attempt]
    M --> N[Security Alert]
    N --> O[Check Lock Threshold]
    O --> P[Return 400]
    L -->|Yes| Q[Email Verified Check]
    Q --> R[Session Regeneration]
    R --> S[Store in Redis]
    S --> T[Return Success + User Data]
```

---

## Security Configuration

### Authentication Config
```typescript
const authConfig = {
  saltRounds: 12,                          // Bcrypt cost factor
  sessionTimeout: 60 * 60 * 1000,          // 1 hour
  maxLoginAttempts: 5,                     // Before lockout
  lockoutDuration: 30 * 60 * 1000,         // 30 minutes
  emailVerificationExpiry: 24 * 60 * 60 * 1000,  // 24 hours
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: 15 * 60 * 1000,               // 15 minutes
  refreshTokenExpiry: 7 * 24 * 60 * 60 * 1000,  // 7 days
};
```

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Redis
REDIS_URL=redis://localhost:6379
LOCAL_DISABLE_REDIS=false

# Session
SESSION_SECRET=your-secret-key

# Security
REQUIRE_EMAIL_VERIFICATION=true
JWT_SECRET=your-jwt-secret
```

---

## Key Features

### ✅ Security Features
- **Bcrypt password hashing** with 12 salt rounds
- **Account lockout** after 5 failed attempts
- **Session regeneration** on login to prevent fixation
- **Redis-backed sessions** with 8-hour TTL
- **CSRF protection** via sameSite cookies
- **Rate limiting** on authentication endpoints
- **Bot prevention** middleware (optional CAPTCHA)
- **Security alert emails** on failed attempts
- **Audit logging** for all authentication events

### ✅ Compatibility Features
- **Multiple password field formats** (password_hash, passwordHash, password)
- **Email or username login** support
- **Test environment** in-memory storage fallback
- **Flexible Redis configuration** with local bypass option
- **Database field mapping** (snake_case ↔ camelCase)

### ✅ Performance Features
- **Connection pooling** for PostgreSQL
- **Redis session caching** to reduce DB load
- **Non-blocking Redis connect** for startup performance
- **Indexed database queries** on email, username, store

---

## Testing & Monitoring

### Key Logging Points
1. **Login attempt start:** `login-start`
2. **User lookup result:** `login-user-lookup-complete`
3. **Password verification:** `login-password-compare-done`
4. **Session creation:** `login-session-set-begin/complete`
5. **Failed attempts:** Account lockout logs table

### Error Handling
- **User not found:** Generic "Invalid email or password"
- **Invalid password:** Same generic message (security)
- **Account locked:** Specific lockout message with duration
- **Email not verified:** Clear verification required message
- **Internal errors:** Generic 500 with detailed logging

---

## Implementation Notes

1. **Password Storage:** Always use bcrypt with proper salt rounds
2. **Session Security:** Regenerate session ID on privilege changes
3. **Error Messages:** Use generic messages to prevent user enumeration
4. **Rate Limiting:** Apply per-IP and per-user limits
5. **Audit Trail:** Log all authentication events for compliance
6. **Redis Fallback:** Gracefully degrade to memory sessions if Redis unavailable
7. **Field Compatibility:** Support multiple field naming conventions during migration
